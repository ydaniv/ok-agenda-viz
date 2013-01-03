define(['d3', 'agenda-tooltips'], function (disregard, Tooltip) {
    // polyfill Object.create if needed
    if (!Object.create) {
        Object.create = function (proto, props) {
            function F () {}
            F.prototype = proto;
            return new F();
        }
    }
    /**
     * some utilities
     */
    /**
     * Functional sugar for getting a specific property from a later-defined object
     *
     * @param p {String|Number} property name or index
     * @return getter {Function} a function that takes an `Object` or an `Array` and returns it's `p` property.
     */
    function prop (p) {
        return function (obj) {
            return obj[p];
        };
    }
    /**
     * Takes two `Object`s and extends the first with the latter.
     *
     * @param target {Object} target object to paste to
     * @param source {Object} the source object to copy from
     * @return target {Object}
     */
    function extend (target, source) {
        var k;
        for ( k in source ) {
            target[k] = source[k];
        }
        return target;
    }
    /**
     * Checks whether a given argument is either `null` or `undefined`.
     *
     * @param arg {*} argument to check
     * @param [def] {*} default fallback in case `arg` is not defined
     * @return def|arg {*} the argument if defined or default value if not.
     */
    function defined (arg, def) {
        return arg == null ? def : arg;
    }

    // cache the d3 namespace in this scope
    var d3 = window.d3;

    /**
     * Abstract parent class for all charts.
     *
     * @constructor
     * @name Chart
     * @param options {Object} configuration object for the Chart instance
     */
    function Chart (options) {
        var chart = this,
            parent_node;
        // set initial chart data
        this.setData(options.data);
        // create the chart's canvas
        this.svg = options.svg || d3.select(options.container || 'body').append('svg');
        // fix bug in FF - `svg` element has no `offsetParent` property
        // fix bug in IE9- - doesn't have neither
        parent_node = this.svg[0][0].offsetParent || this.svg[0][0].parentElement || this.svg[0][0].parentNode;
        // set chart dimensions
        this.height = options.height || parent_node.offsetHeight;
        this.width = options.width || parent_node.offsetWidth;
        // set the chart's padding
        this.padding = options.padding || {
            x   : 40,
            y   : 40
        };
        // if we have initialy defined domains or ranges use them
        this.domains = options.domains;
        this.ranges = options.ranges;
        // create wrappers for the mouseover and mouseout event handlers
        this.mouseover = function(d,i) {
            if ( ! chart.events_disabled ) {
                // shoes tooltip
                chart.showDetails(d, d3.select(this));
                // call instance's mouseover handler if set 
                options.mouseover && options.mouseover.call(this, d, i);
            }
        };
        this.mouseout = function(d, i) {
            if ( ! chart.events_disabled ) {
                // hides tooltip
                chart.hideDetails(d);
                // call instance's mouseout handler if set
                options.mouseout && options.mouseout.call(this, d, i);
            }
        };
        // set other event handlers
        this.click = options.click;
        this.touchstart = options.touchstart;
        // whether to draw axes
        this.no_axes = options.no_axes;
        // create a d3 event dispatcher for this instance
        this.dispatcher = d3.dispatch('start', 'end');
        // set canvas width and height
        this.svg.attr('width', this.width)
            .attr('height', this.height);
        if ( options.id ) {
            this.svg.attr('id', options.id);
            this.id = options.id;
        }
    }

    // Chart class inheritable properties and methods
    Chart.prototype = {
        constructor     : Chart,
        /**
         * Sets the chart's X values for domain setting.
         * If set in the initial `options` object then those values will be used by default.
         * If arguments are given then they overide that option.
         * If none are set then use `[-100, 100, 0]`.
         *
         * @memberOf Chart
         * @param [min] {Number} numeric minimal value for x
         * @param [max] {Number} numeric maximal value for x
         * @param [med] {Number} numeric middle (always 0 in this case) value for x
         * @return {Chart}
         */
        setXDomain      : function (min, max, med) {
            var x_min, x_max, x_med;
            if ( this.domains ) {
                x_min = defined(this.domains[0], null);
                x_max = defined(this.domains[1], null);
                x_med = defined(this.domains[2], null);
            }
            this.x_in_min = defined(min, defined(x_min, -100));
            this.x_in_max = defined(max, defined(x_max, 100));
            this.x_in_med = defined(med, defined(x_med, 0));
            return this;
        },
        /**
         * Sets the chart's Y values domain setting.
         * Uses 0 for minimum and maximal volume value available for maximum.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        setYDomain      : function () {
            // set Y scale min and max
            this.y_in_min = 0;
            this.y_in_max = d3.max(this.data, prop(1)); // by volume
            return this;
        },
        /**
         * Sets the chart's domains
         *
         * @memberOf Chart
         * @return {Chart}
         */
        setDomains      : function () {
            this.setXDomain()
                .setYDomain();
            return this;
        },
        /**
         * Sets the chart's X scale.
         * Creates a new `d3.scale.linear()` and
         * calls `domain` and `range` on it with set x min/max values.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        setXScale       : function () {
            // set X scale
            this.x_scale = d3.scale.linear()
                .domain([this.x_in_min, this.x_in_max])
                .range([this.x_out_min, this.x_out_max]);
            return this;
        },
        /**
         * Sets the chart's Y scale.
         * Creates a new `d3.scale.linear()` and
         * calls `domain` and `range` on it with set y min/max values.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        setYScale       : function () {
            // set Y scale
            this.y_scale = d3.scale.linear()
                .domain([this.y_in_min, this.y_in_max])
                .range([this.y_out_min, this.y_out_max]);
            // set ranges' values
            return this;
        },
        /**
         * Sets the chart's color scale.
         * Creates a new `d3.scale.linear()` and
         * calls `domain` and `range` on it with set x min/med/max values for domain
         * and `['red', 'gray', '#39B54A']` for range.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        setColorScale   : function () {
            // set the color scale
            this.color_scale = d3.scale.linear()
                .domain([this.x_in_min, this.x_in_med, this.x_in_max])
                .range(['red', 'gray', '#39B54A']);
            return this;
        },
        /**
         * Sets the chart's scales.
         * Calls all methods that set domains, ranges and scales.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        setScales       : function () {
            this.setDomains()
                .setRanges()
                .setXScale()
                .setYScale()
                .setColorScale();
            return this;
        },
        /**
         * Creates the bottom color axis.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        createColorAxis : function () {
            var color_axis;
            // create the color axis
            if ( ! this.color_grad ) {
                // create the linearGradient element that will paint our color axis
                this.color_grad = this.svg.select('defs').append('linearGradient')
                    .attr('id', (this.id ? this.id + '-' : '') + 'color-axis');

                // for future possible support of IE8 - there's no `g` element support in VML and RaphaelJS
                // although r2d3.js may have support for it eventually
                // simply, if `g` is not supported then add all the elements straight to the `svg` element
                color_axis = IE8_COMPAT_MODE ? this.svg : this.svg.append('g');

                // create the axis itself
                color_axis.append('rect')
                    .attr('x', this.padding.x)
                    .attr('y', this.y_out_min)
                    .attr('height', '2px')
                    .attr('width', this.width - (2 * this.padding.x))
                    .attr('stroke-width', '0px')
                    .attr('fill', 'url(#' + (this.id ? this.id + '-' : '') + 'color-axis)');
                // add the related images and labels
                if ( ! this.no_color_axis_images ) {
                    // add '-' image
                    color_axis.append('image')
                        // image is 10x10 + 1px margin
                        .attr('x', this.padding.x - 11)
                        .attr('y', this.y_out_min - 4)
                        .attr('width', 10)
                        .attr('height', 10)
                        .attr('xlink:href', 'img/icons/i_minus.png');
                    // 'against' label
                    color_axis.append('text')
                        .style('direction', 'ltr')
                        .attr('x', this.padding.x - 20)
                        .attr('y', this.y_out_min + 20)
                        .attr('font-family', 'openfont')
                        .attr('fill', this.color_scale(this.x_in_min))
                        .attr('font-size', 18)
                        .attr('font-weight', 800)
                        .text('נגד');
                    // add '+' image
                    color_axis.append('image')
                        // image is 10x10 + 1px margin
                        .attr('x', this.width - this.padding.x + 1)
                        .attr('y', this.y_out_min - 4)
                        .attr('width', 10)
                        .attr('height', 10)
                        .attr('xlink:href', 'img/icons/i_plus.png');
                    // 'for' label 
                    color_axis.append('text')
                        .style('direction', 'ltr')
                        .attr('x', this.width - this.padding.x - 10)
                        .attr('y', this.y_out_min + 20)
                        .attr('font-family', 'openfont')
                        .attr('fill', this.color_scale(this.x_in_max))
                        .attr('font-size', 18)
                        .attr('font-weight', 800)
                        .text('בעד');
                }
            }
            // clear all old `stop` tags
            this.color_grad.selectAll('stop').remove();
            // append the new `stop` elements with current values of:
            // minimal x-value color
            this.color_grad.append('stop').attr('stop-color', this.color_scale(this.x_in_min)).attr('offset', '0%');
            // if the X Domain's min and max are around the middle (0) - so check if we're passing through 0 
            if ( this.x_in_min < this.x_in_med && this.x_in_med < this.x_in_max ) {
                // then add a middle color stop (to gray)
                this.color_grad.append('stop').attr('stop-color', this.color_scale(this.x_in_med)).attr('offset', ((((this.x_in_med - this.x_in_min)/(this.x_in_max - this.x_in_min)) * 100) | 0) + '%');
            }
            // maximal x-value color
            this.color_grad.append('stop').attr('stop-color', this.color_scale(this.x_in_max)).attr('offset', '100%');
            return this;
        },
        /**
         * Creates the chart's axes.
         * Paints axes related graphics like vertical line that indicates 0
         * and the 20 horizontal lines that partition the chart.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        createAxes      : function () {
            var n, dy;
            // do it once, unless forcibly cleared
            if ( ! this.no_axes ) {
                // if there's an old x_axis
                if ( this.x_axis ) {
                    // remove it
                    this.x_axis.remove();
                }
                // create X axis - simply a vertical line at `x=0`
                this.x_axis = this.svg.insert('line', ':first-child')
                    .attr('x1', this.x_scale(0))
                    .attr('y1', 0)
                    .attr('x2', this.x_scale(0))
                    .attr('y2', this.height)
                    .attr('stroke', '#E6E6E6')
                    .attr('stroke-width', 1);

                // create the Y axis - 20 horizontal lines that equally partition the chart's area.
                // add it once
                if ( ! this.y_axis ) {
                    // `g` element compatibility check
                    this.y_axis = IE8_COMPAT_MODE ? this.svg : this.svg.append('g');
                    // devide into 21 equal parts
                    dy = (this.y_out_min) / 21;
                    // loop the parts
                    for ( n = 1; n < 21 ; n++ ) {
                        // create the lines
                        this.y_axis.append('line')
                            .attr('x1', 0)
                            .attr('y1', n * dy)
                            .attr('x2', this.width)
                            .attr('y2', n * dy)
                            .attr('stroke', '#D9EEFD')
                            .attr('stroke-width', 1)
                            .attr('stroke-dasharray', '6,3');
                    }
                    // draw the Y axis label on the left
                    // append the dashed line
                    this.y_axis.append('line')
                        .attr('x1', this.x_out_min - this.padding.x / 2)
                        .attr('x2', this.x_out_min - this.padding.x / 2)
                        .attr('y1', this.y_out_max)
                        .attr('y2', this.y_out_min)
                        .attr('stroke', '#65BAF7')
                        .attr('stroke-width', 2)
                        .attr('stroke-dasharray', '2,1');
                    // add the top triangle
                    this.y_axis.append('polygon')
                        .attr('points', '0 8,3 0,4 0,8 8')
                        .attr('fill', '#65BAF7')
                        .attr('transform', 'translate(' +
                        (this.x_out_min - this.padding.x / 2 - 4) + ' ' +
                        (this.y_out_max - 2) + ')');
                    // and the bottom triangle
                    this.y_axis.append('polygon')
                        .attr('points', '0 0,8 0,4 8,3 8')
                        .attr('fill', '#65BAF7')
                        .attr('transform', 'translate(' +
                        (this.x_out_min - this.padding.x / 2 - 4) + ' ' +
                        (this.y_out_min - 6) + ')');
                    // add the "_transparent_" `rect` that will leave room for the textual label
                    this.y_axis.append('rect')
                        .attr('x', this.x_out_min - 30)
                        .attr('y', (this.y_out_min - this.y_out_max) / 2 - 24)
                        .attr('width', 22)
                        .attr('height', 110)
                        .attr('fill', '#f6f7ec')
                        .attr('stroke', 'none');
                    // add the textual label
                    this.y_axis.append('text')
                        .style('direction', 'ltr')
                        .attr('x', this.x_out_min - this.padding.x / 2 + 4)
                        .attr('y', (this.y_out_min - this.y_out_max) / 2 + 80)
                        .attr('font-family', 'openfont')
                        .attr('fill', '#65BAF7')
                        .attr('font-size', 18)
                        .attr('font-weight', 800)
                        .attr('transform', 'rotate(-90 ' +
                        (this.x_out_min - this.padding.x / 2 + 4) + ' ' +
                        ((this.y_out_min - this.y_out_max) / 2 + 80) + ')')
                        .text('מידת פעילות');
                }
                // draw the color axis
                this.createColorAxis()
            }
            return this;
        },
        /**
         * Attach the chart's DOM events (mouse/touch).
         *
         * @memberOf Chart
         * @return {Chart}
         */
        addEvents       : function () {
            this.svg.selectAll(this.selector).on('mouseover', this.mouseover, false)
                .on('mouseout', this.mouseout, false)
                .on('click', this.click, false)
                .on('touchstart', this.touchstart, false);
            return this;
        },
        /**
         * Toggles the attached events on and off.
         * If the `on` argument is `undefined` then it is treated as `false` and events are turned off.
         *
         * @memberOf Chart
         * @param [on] {Boolean} whether to force turning the events on
         * @return {Chart}
         */
        toggleEvents    : function (on) {
            this.events_disabled = !on;
            this.svg.classed('no-events', !on);
            return this;
        },
        /**
         * An alias for calling `render` + `transition`.
         * Essentially renders the chart and immediately starts to transition current selection in.
         *
         * @memberOf Chart
         * @return {Chart}
         */
        draw            : function () {
            if ( ! this.selection ) {
                this.render()
                    .selection.all.call(this.transition, this);
            }
            // for now this is never used so left for future enhancement
            else {
                this.svg.data(this.data).selectAll(this.selector);
            }
            return this;
        }
    };

    /**
     * Renders the parties data as circles.
     * Radius represents size of party in number of members, color and x position
     * represents against/pro the agenda and y position is volume of activitiy.
     *
     * @constructor
     * @name PartiesChart
     * @extends Chart
     * @param options {Object} configuration object for the PartiesChart instance
     */
    function PartiesChart (options) {
        // call the parent class's constructor
        Chart.call(this, options);
        // the basic tag name of the element used for the visualization
        this.element = 'circle';
        // a common selector for the above elements
        this.selector = '.party';
    }

    // PartiesChart class inheritable properties and methods
    /**
     *  first we extend {@link Chart}.
     */
    PartiesChart.prototype = extend(Object.create(Chart.prototype), {
        constructor : PartiesChart,
        /**
         * Sets the instance's data.
         * Takes an `Array` of `Object`s and maps it into an `Array` of Array`s.
         *
         * @memberof PartiesChart
         * @param data {Array} list of `Objects` that represent parties
         * @return {PartiesChart}
         */
        setData     : function (data) {
            //# Array.prototype.map
            this.data = data.map(function(party) {
                // value | 0 is the same as Math.round(value)
                return [
                    party.score | 0, //0
                    party.volume | 0,//1
                    party.size | 0,  //2
                    party.name,      //3
                    +party.id        //4
                ];
            }).sort(function (a, b) {
                    // sort from the large to the small ones, to make sure they don't cover each other entirely
                    return b[2] - a[2];
                });
            return this;
        },
        /**
         * Sets the output values for the chart's ranges.
         * If the `this.ranges` is set then it's used to always override given arguments or defaults.
         *
         * @memberof PartiesChart
         * @param [x_min] {Number} minimal value to use for x range
         * @param [x_max] {Number} maximal value to use for x range
         * @param [y_min] {Number} minimal value to use for y range
         * @param [y_max] {Number} maximal value to use for y range
         * @param [r_min] {Number} minimal value to use for radii range
         * @param [r_max] {Number} maximal value to use for radii range
         * @return {PartiesChart}
         */
        setRanges   : function (x_min, x_max, y_min, y_max, r_min, r_max) {
            // if ranges was set in options
            if ( this.ranges && ! this.ranges_set ) {
                this.ranges_set = true;
                // use it to override the defaults
                return this.setRanges.apply(this, this.ranges);
            }
            // use arguments or:
            // left padding
            this.x_out_min = defined(x_min, this.padding.x);
            // left padding + chart's width
            this.x_out_max = defined(x_max, this.width - this.padding.x);
            // top padding + chart's height
            this.y_out_min = defined(y_min, this.height - this.padding.y);
            // top padding
            this.y_out_max = defined(y_max, this.padding.y);
            // smallest radius * 2
            this.r_out_min = defined(r_min, this.r_in_min * 2);
            // largest radius * 2
            this.r_out_max = defined(r_max, this.r_in_max * 2);
            return this;
        },
        /**
         * Sets the instance's radii domain.
         *
         * @memberof PartiesChart
         * @return {PartiesChart}
         */
        setRDomain  : function () {
            var getSize = prop(2);
            // set R scale min and max
            this.r_in_max = d3.max(this.data, getSize);
            this.r_in_min = d3.min(this.data, getSize);
            return this;
        },
        /**
         * Sets the instance's radii scale.
         * Calls `d3.scale.linear()` and then `.domain()` and `.range()` with respective input and output r values.
         *
         * @memberof PartiesChart
         * @return {PartiesChart}
         */
        setRScale   : function () {
            // set R scale
            this.r_scale = d3.scale.linear()
                .domain([this.r_in_min, this.r_in_max])
                .range([this.r_out_min, this.r_out_max]);
            return this;
        },
        /**
         * Sets the instance's scales.
         * Calls {@link Chart.setScales} along with setting the radii scale.
         *
         * @memberof PartiesChart
         * @override {@link Chart.setScales}
         * @return {PartiesChart}
         */
        setScales   : function () {
            this.setRDomain();
            // call super class's method
            Chart.prototype.setScales.call(this);
            this.setRScale();
            return this;
        },
        /**
         * Renders the chart.
         * If `complete` is `false` it does basic rendering but keeps the graph hidden, preparing it
         * for later call of {@link PartiesChart.transition}.
         * If `complete` is `true` draws the chart completely according to data.
         *
         * @memberof PartiesChart
         * @param [complete] {Boolean} whether to draw the chart completely or keep the graph heidden for later transitioning
         * @return {PartiesChart}
         */
        render      : function (complete) {
            var chart = this;
            // an interface for retrieving the chart's elements
            this.selection = {
                all     : null
            };
            this.selection.all = this.setScales()
                .createAxes()
                // this is basic d3 stuff for adding elements according to data
                .svg.selectAll(this.element)
                .data(this.data)
                .enter()
                // add the parties' circles
                .append(this.element)
                .attr('class', this.selector.slice(1))
                // position the circles
                //TODO: make sure they don't cover each other
                .attr('cx', function(d) {
                    return chart.x_scale(d[0]);
                })
                .attr('cy', function(d) {
                    return chart.y_scale(d[1]);
                })
                // if not `complete` then radii initially set to 0 and then transitioned
                .attr('r', ! complete ? 0 : function (d) {
                chart.r_scale(d[2]);
            })
                // paint
                .attr('fill', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('fill-opacity', 0)
                .attr('stroke', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('stroke-width', '4px');
            // instantiate tooltips
            // this is for hover/touchstart
            this.tooltip = Tooltip(this.svg);
            // this is for click
            this.persistip = Tooltip(this.svg);
            // attach chart events
            this.addEvents();
            return this;
        },
        /**
         * Animates the transtion of the chart's elements in and out of view.
         * This method is to be used in the `selection.call(method)` way of invocation.
         *
         * @memberof PartiesChart
         * @param selection {d3.selection} a selection over elements in the chart
         * @param chart {PartiesChart} alias for this
         * @param [transit_out] {Boolean} whether this transition is done into or out of view
         * @param [callback] {Function} a callback function to be triggered at end of transition
         */
        transition  : function (selection, chart, transit_out, callback) {
            var count = selection.length, counter = 1;
            // transition the radii of all circles
            selection.transition()
                .duration(200)
                // transiting out is all together (no delay) and in is incremental
                .delay(transit_out ? 0 : function(d, i) {
                return i * 50;
            })
                .attr('r', transit_out ? 0 : function(d) {
                return chart.r_scale(d[2]);
                // in d3 `each` is used as a transitionend event
            }).each('start', function () {
                    // first element transitioned
                    if ( counter == 1 ) {
                        // toggle chart events off
                        chart.toggleEvents(false);
                        // dispatch start event
                        chart.dispatcher.start('toggle');
                    }
                })
                .each('end', function () {
                    // last element transitioned
                    if ( counter === count) {
                        // if direction is in then turn events on
                        transit_out || chart.toggleEvents(true);
                        // dispatch end event
                        chart.dispatcher.end('toggle');
                        // call `callback` if needed
                        callback && callback();
                    } else {
                        // advance with each transitioned element
                        counter += 1;
                    }
                });
            // if direction is out
            if ( transit_out ) {
                // hide tooltips
                chart.hideDetails();
            }
        },
        /**
         * Toggles chart's zoom level between the absolute scope (-100, 100)
         * or total members' scope (minimum, maximum) of given scores.
         *
         * @memberof PartiesChart
         * @param is_in {Boolean} whether zooming in
         * @return {PartiesChart}
         */
        zoom        : function (is_in) {
            var chart = this,
            // count all elements
                count = this.selection.all.length, counter = 1;
            // if `is_in` is not specified then toggle state
            if ( ! arguments.length ) {
                // toggle if `is_in` is not defined
                is_in = ! this.zoom_in;
            }
            // set state
            this.zoom_in = is_in;
            // zoom controls only the x scale
            is_in ?
                // defaults to min and max of input
                this.setXDomain() :
                // override with absolute values
                this.setXDomain(-100, 100);
            this.setRanges()
                .setXScale()
                // update axes
                .createAxes();
            // change data to new selection and redraw the selected party
            this.svg.data(this.data).selectAll(this.selector)
                .transition()
                .duration(500)
                .attr('cx', function(d, i) {
                    return chart.x_scale(d[0]);
                })
                .each('start', function () {
                    if ( counter == 1 ) {
                        // turn off chart events
                        chart.toggleEvents(false);
                        // dispatch start event
                        chart.dispatcher.start('zoom');
                    }
                })
                .each('end', function () {
                    if ( counter === count) {
                        // turn chart events on
                        chart.toggleEvents(true);
                        // dispatch end event
                        chart.dispatcher.end('zoom');
                    } else {
                        counter += 1;
                    }
                });
            return this;
        },
        /**
         * Shows tooltip.
         *
         * @memberof PartiesChart
         * @param data {Object} a single element's data representation
         * @param element {d3.selection} a single element wrapped as a d3.selection
         * @return {Tooltip}
         */
        showDetails : function (data, element) {
            var content = data[3],
            // the `+` casts them all to `Numbers`
                x = +element.attr('cx'),
                cy = +element.attr('cy'),
                r = +element.attr('r'),
                y = cy - r,
            // alternative y position in case the tooltip is over the party
                alter_y = cy + r;
            return this.tooltip.showTooltip(content, this.color_scale(data[0]), x | 0, y | 0, null, alter_y);
        },
        /**
         * Hides the tooltip.
         *
         * @memberof PartiesChart
         * @return {Tooltip}
         */
        hideDetails : function () {
            return this.tooltip.hideTooltip();
        }
    });

    /**
     * Renders the members' chart.
     *
     * @constructor
     * @name MembersChart
     * @extends {Chart}
     * @param options {Object} configuration object for the MembersChart instance
     */
    function MembersChart (options) {
        var _self = this;
        // call super class constructor
        Chart.call(this, options);
        // set optoins or defaults
        this.bar_width = options.bar_width || 8;
        this.stroke = options.stroke || 0;
        // for now this is not compatible with IE8 but r2d3.js might be ready for `g` elements in the future
        this.element = 'g';
        this.selector = '.member';
        // a store for parties toggled on
        this.parties_toggle = {};
        this.zoom_in = false;
        // the points attribute value of the polygon that represents the torso of the member
        this.member_torso = '0 10,0 1,1 1,1 -1,3 -1,3 1,5 1,5 -1,7 -1,7 1,8 1,8 10';
        // a smaller torso for the parties view
//        this.member_torso = '0 15,0 0,4 0,4 15';
        // 15% threshold for member's volume, below which the member is rendered only as a circle below the x axis
        this.volume_threshold = .15;
        // add a global `defs` element
        this.svg.append('defs');
    }

    // MembersChart class inheritable properties and methods
    /**
     *  first we extend {@link Chart}.
     */
    MembersChart.prototype = extend(Object.create(Chart.prototype), {
        constructor     : MembersChart,
        /**
         * Sets the instance's data.
         * Takes an `Array` of `Object`s and maps it into an `Array` of Array`s.
         *
         * @memberof MembersChart
         * @param data {Array} list of `Objects` that represent parties
         * @return {MembersChart}
         */
        setData         : function (data) {
            //# Array.prototype.map
            this.data = data.map(function(member) {
                return [
                    member.score | 0,   //0
                    member.volume | 0,  //1
                    member.rank,        //2
                    member.name,        //3
                    member.party,       //4
                    +member.party_id,   //5
                    member.img_url,     //6
                    member.absolute_url,//7
                    +member.id          //8
                ];
            }).sort(function (a, b) {
                    // sort from the higher to the lower ones, to make sure they don't cover each other entirely
                    return b[1] - a[1];
                });
            return this;
        },
        /**
         * Sets the output values for the chart's ranges.
         * If the `this.ranges` is set then it's used to always override given arguments or defaults.
         *
         * @memberof MembersChart
         * @param [x_min] {Number} minimal value to use for x range
         * @param [x_max] {Number} maximal value to use for x range
         * @param [y_min] {Number} minimal value to use for y range
         * @param [y_max] {Number} maximal value to use for y range
         * @return {MembersChart}
         */
        setRanges       : function (x_min, x_max, y_min, y_max) {
            // if ranges was set in options
            if ( this.ranges && ! this.ranges_set ) {
                this.ranges_set = true;
                // use it to override the defaults
                return this.setRanges.apply(this, this.ranges);
            }
            // defaults:
            // left padding
            this.x_out_min = defined(x_min, this.padding.x);
            // left padding + chart's width
            this.x_out_max = defined(x_max, this.width - this.padding.x);
            // top padding - chart's height
            this.y_out_min = defined(y_min, this.height - this.padding.y);
            // top padding
            this.y_out_max = defined(y_max, this.padding.y);
            return this;
        },
        /**
         * Renders an element in the chart.
         * This method is to be used in the `selection.call(method)` way of invocation.
         *
         * @memberof MembersChart
         * @param selection {d3.selection} a selection over elements in the chart
         * @param chart {MembersChart} alias for this
         * @param complete {Boolean} whether to completely draw this element
         */
        renderElement   : function (selection, chart, complete) {
            var threshold = (chart.volume_threshold * chart.y_in_max) | 0;
            selection.classed(chart.selector.slice(1), true)
                .attr('transform', function(d, i) {
                    return 'translate(' + chart.x_scale(d[0]) + ',0)';
                    // for each `g` element, check if the corresponding member's volume is below or over threshold
                    // and render accordingly
                }).each(function (d, i) {
                    d3.select(this).call(
                        // if below volume threshold
                        d[1] < threshold ?
                            // draw under the x axis
                            chart.renderUnder :
                            // otherwise draw the standard member visualization
                            chart.renderOver,
                        chart,
                        complete
                    );
                });
        },
        /**
         * Renders an element in the chart in the standard form.
         * This method is to be used in the `selection.call(method)` way of invocation.
         *
         * @memberof MembersChart
         * @param selection {d3.selection} a selection over elements in the chart
         * @param chart {MembersChart} alias for this
         * @param complete {Boolean} whether to completely draw this element
         */
        renderOver      : function (selection, chart, complete) {
            var bar_w = chart.bar_width;
            selection.classed('volume_over', true).classed('active', complete)
                // draw the dashed bar
                .append('line')
                .attr('x1', bar_w / 2)
                .attr('x2', bar_w / 2)
                .attr('y1', ! complete ? chart.y_out_min : function(d) {
                return chart.y_scale(d[1]);
            })
                // if not `complete` then height starts at 0 and then transitioned according to chart height and y_scale
                .attr('y2', chart.y_scale(chart.y_in_min))
                .attr('stroke-width', bar_w)
                .attr('stroke-dasharray', '2,1')
                .attr('stroke', function(d) {
                    return chart.color_scale(d[0]);
                });
            // lets start drawing the person
            // this is the torso
            selection.append('polygon')
                .attr('points', chart.member_torso)
                .attr('fill', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('transform', function (d) {
                    return 'translate(0,' + (complete ? chart.y_scale(d[1]) : chart.height) + ')';
                })
                .style('visibility', complete ? 'visible' : 'hidden');
            // this is the head
            selection.append('circle')
                .attr('cx', bar_w / 2)
                .attr('cy', ! complete ? chart.y_out_min : function(d) {
                return chart.y_scale(d[1]);
            })
                .attr('stroke', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('r', ! complete ? 0 : bar_w / 2);
            // add a transparent rect to catch the events
            selection.append('rect')
                .attr('x', 0)
                .attr('y', ! complete ? chart.y_out_min : function(d) {
                return chart.y_scale(d[1]);
            })
                .attr('width', bar_w)
                .attr('height', ! complete ? 0 : function (d) {
                return chart.y_scale(d[1]);
            });
        },
        /**
         * Renders an element in the chart of a member that has a volume below threshold.
         * This method is to be used in the `selection.call(method)` way of invocation.
         *
         * @memberof MembersChart
         * @param selection {d3.selection} a selection over elements in the chart
         * @param chart {MembersChart} alias for this
         * @param complete {Boolean} whether to completely draw this element
         */
        renderUnder     : function (selection, chart, complete) {
            var half_bar_w = chart.bar_width / 2;
            selection.classed('volume_under', true).classed('active', complete)
                // draw a head below the x axis
                .append('circle')
                .attr('cx', half_bar_w)
                .attr('cy', chart.y_out_min + half_bar_w * 2)
                .attr('stroke', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('r', ! complete ? 0 : half_bar_w);
        },
        /**
         * Renders the chart.
         * If `complete` is `false` it does basic rendering but keeps the graph hidden, preparing it
         * for later call of {@link MembersChart.transition}.
         * If `complete` is `true` draws the chart completely according to data.
         *
         * @memberof MembersChart
         * @param [complete] {Boolean} whether to draw the chart completely or keep the graph heidden for later transitioning
         * @return {MembersChart}
         */
        render          : function (complete) {
            var chart = this;
            // an interface for retrieving the chart's elements
            this.selection = {
                // gets all members' elements
                all         : null,
                // get all members' of a party by its `id`
                getParty    : function (id) {
                    if ( !(id in this.parties) ) {
                        this.parties[id] = this.all.filter(function (d, i) {
                            return d[5] === id;
                        });
                    }
                    return this.parties[id];
                },
                // get a member by `id`
                getMember   : function (id) {
                    return this.all.filter(function (d) {
                        return d[8] === id;
                    });
                },
                // parties cache
                parties     : {}
            };
            // prepare chart
            this.setScales()
                .createAxes();
            // render elements
            this.selection.all = this.svg.selectAll(this.selector)
                .data(this.data)
                .enter()
                // add the member's rectangle
                .append(this.element)
                .call(this.renderElement, this, complete);
            if ( complete ) {
                this.parties_toggle[0] = true;
                this.select();
            }
            // attach animation events to the chart's events dispatcher
            this.dispatcher.on('start', function (type, selection, out) {
                if ( type === 'toggle' ) {
                    if ( out ) {
                        // make the event catching rects disappear
                        selection.select('rect')
                            .attr('y', chart.y_out_min)
                            .attr('height', 0);
                    }
                    else {
                        //show member's head and torso
                        selection.select('circle')
                            .attr('r', chart.bar_width / 2);
                        selection.select('polygon')
                            .style('visibility', 'visible');
                    }
                }
            });
            this.dispatcher.on('end', function (type, selection, out) {
                if ( type === 'toggle' && out ) {
                    // make sure we make the person icon disappear at the end of the transition
                    selection.select('circle')
                        .attr('r', 0);
                    selection.select('polygon')
                        .style('visibility', 'hidden');
                }
            });
            // init tooltips
            this.tooltip = Tooltip(this.svg);
            this.persistip = Tooltip(this.svg);
            // attach chart's events
            this.addEvents();
            return this;
        },
        /**
         * Returns a selection of member elements, optionally filtered by a party id or all of them if
         * no arguments are supplied (will not work like `.select(null, true|false)`).
         *
         * @memberof MembersChart
         * @param [id] {Number} a party id to filter members by
         * @param [dont_set] {Boolean} whether to set `this.selection.current` the current selection result and persist it
         * @return {d3.selection}
         */
        select          : function (id, dont_set) {
            var selection = arguments.length ? this.selection.getParty(id) : this.selection.all;
            if ( ! dont_set ) {
                // persist the selection to `this.selection.current`
                this.selection.current = selection;
            }
            return selection;
        },
        /**
         * Toggles the state of a selection of members by a party.
         * This state indicates whether this party is active in view or not.
         *
         * @memberof MembersChart
         * @param party {Number|d3.selection} a party id to filter members by or a party element's selection to get the id from
         * @param [show_hide] {Boolean} whether to also toggle visibility by calling `show` or `hide`.
         * @return {MembersChart}
         */
        toggle          : function (party, show_hide) {
            var id;
            // if party is NOT a selection it's a party_id
            id = party && party.data ? party.data()[0][5] : +party;
            // toggle state
            this.parties_toggle[id] = ! this.parties_toggle[id];
            // whether to also turn on/off visual state
            if ( show_hide ) {
                this.parties_toggle[id] ? this.show(id, true) : this.hide(id, true);
            }
            return this;
        },
        /**
         * Toggles on members of a single party and off all others.
         *
         * @memberof MembersChart
         * @param party {Number|d3.selection} a party id to filter members by or a party element's selection to get the id from
         * @return {MembersChart}
         */
        single          : function (party) {
            var id, pid;
            // if party is NOT a selection it's a party_id
            id = party && party.data ? party.data()[0][5] : +party;
            // if toggling this party to 'on'
            if ( ! this.parties_toggle[id] ) {
                // toggle off all other parties
                for ( pid in this.parties_toggle ) {
                    // loose checking here to allow `String`-`Number` conversion
                    if ( id != pid ) {
                        this.hide(+pid, true);
                    }
                }
            }
            // toggle this party on
            this.toggle(id, true);
            return this;
        },
        /**
         * Toggles visibility on of members of a single party.
         *
         * @memberof MembersChart
         * @param party {Number|d3.selection} a party id to filter members by or a party element's selection to get the id from
         * @param [override_persist] {Boolean} whether to override the persistent state of the party
         * @param [callback] {Function} an optional callback for after the transition in
         * @return {MembersChart}
         */
        show            : function (party, override_persist, callback) {
            var id;
            // if party is NOT a selection it's a party_id
            id = party && party.data ? party.data()[0][5] : +party;
            // get old state
            // if we're allowed to toggle the persistent state or it's not persistent
            if ( override_persist || ! this.parties_toggle[id] ) {
                // turn on persistency if `override_persist` is `true`
                override_persist && (this.parties_toggle[id] = true);
                // if toggling to active then select
                this.select(id)
                    // transition in or out according to new state - `true` => 'out'
                    .call(this.transition, this, false, callback);
            }
            return this;
        },
        /**
         * Toggles visibility off of members of a single party.
         *
         * @memberof MembersChart
         * @param party {Number|d3.selection} a party id to filter members by or a party element's selection to get the id from
         * @param [override_persist] {Boolean} whether to override the persistent state of the party
         * @param [callback] {Function} an optional callback for after the transition in
         * @return {MembersChart}
         */
        hide            : function (party, override_persist, callback) {
            var id;
            // if party is NOT a selection it's a party_id
            id = party && party.data ? party.data()[0][5] : +party;
            // get old state
            // if we're allowed to toggle the persistent state or it's not persistent
            if ( override_persist || ! this.parties_toggle[id] ) {
                // disable persistency if `override_persist is `true`
                override_persist && (this.parties_toggle[id] = false);
                // if toggling to active then select
                this.select(id, true)
                    // transition in or out according to new state - `true` => 'out'
                    .call(this.transition, this, true, callback);
            }
            return this;
        },
        /**
         * Animates the transtion of the chart's elements in and out of view.
         * This method is to be used in the `selection.call(method)` way of invocation.
         *
         * @memberof MembersChart
         * @param selection {d3.selection} a selection over elements in the chart
         * @param chart {MembersChart} alias for this
         * @param [transit_out] {Boolean} whether this transition is done into or out of view
         * @param [callback] {Function} a callback function to be triggered at end of transition
         */
        transition      : function (selection, chart, transit_out, callback) {
            var count = selection.filter('.volume_over')[0].length, counter = 1,
                transition = selection.classed('active', ! transit_out).transition()
                    .duration(400)
                    .delay(function(d, i) {
                        return i * 10;
                    });
            // transition the line to stretch up
            transition.select('line')
                .attr('y1', transit_out ? chart.y_out_min : function(d) {
                return chart.y_scale(d[1]);
            })
                .each('start', function () {
                    if ( counter == 1 ) {
                        // dispatch transition start event
                        chart.dispatcher.start('toggle', selection, transit_out);
                    }
                })
                .each('end', function () {
                    var member;
                    if ( counter === count) {
                        // dispatch transition end event
                        chart.dispatcher.end('toggle', selection, transit_out);
                        callback && callback();
                    } else {
                        if ( transit_out ) {
                            member = d3.select(this.parentNode);
                            // make sure we make the person icon disappear at the end of the transition
                            member.select('circle')
                                .attr('r', 0);
                            member.select('polygon')
                                .style('visibility', 'hidden');
                        }
                        counter += 1;
                    }
                });
            // transition the person icon
            transition.select('polygon')
                .attr('transform', function (d) {
                    return 'translate(0,' + (transit_out ? chart.height : chart.y_scale(d[1])) + ')';
                });
            transition.filter('.volume_over').select('circle')
                .attr('cy', transit_out ? chart.y_out_min : function(d) {
                return chart.y_scale(d[1]) - chart.bar_width;
            });
            // if transitioning in
            if ( ! transit_out ) {
                // make sure the person icon appears
                selection.select('circle')
                    .attr('r', chart.bar_width / 2);
                // make the event catching rects appear
                selection.select('rect')
                    .attr('y', function (d) {
                        return chart.y_scale(d[1]);
                    })
                    .attr('height', function (d) {
                        return chart.y_out_min - chart.y_scale(d[1])
                    });
            }
            if ( ! count ) {
                chart.dispatcher.start('toggle', selection, transit_out);
                chart.dispatcher.end('toggle', selection, transit_out);
            }
        },
        /**
         * Toggles chart's zoom level between the absolute scope (-100, 100)
         * or total members' scope (minimum, maximum) of given scores in case we're in parties view.
         * In case we're in members view it toggles between absolute and party's scope (minimum, maximu) of
         * its members.
         * @memberof MembersChart
         * @param is_in {Boolean} whether zooming in
         * @param immediate {Boolean} whether to zoom immediately without transitioning
         * @return {MembersChart}
         */
        zoom            : function (is_in, immediate) {
            var chart = this,
                getScore = prop(0),
                counter = 1,
                selection, scope, count;
            // if `is_in` is not specified then toggle state
            if ( ! arguments.length ) {
                is_in = ! this.zoom_in;
            }
            else if ( typeof is_in == 'string' ) {
                scope = is_in;
                is_in = true;
            }
            // set state
            this.zoom_in = is_in;
            // set data according to scope
            if ( is_in && scope !== 'all' ) {
                this.data = this.selection.current.data();
            }
            else {
                this.data = this.selection.all.data();
            }
            is_in ?
                this.setXDomain(d3.min(this.data, getScore), d3.max(this.data, getScore)) :
                this.setXDomain(-100, 100);
            this.setRanges()
                .setXScale()
                .createAxes();
            // change data to new selection and redraw the selected party
            selection = this.svg.data(this.data).selectAll(this.selector);
            count = selection[0].length;
            // transition the members to their new X position depending on new zoom
            selection = (immediate ? selection : selection.transition()
                .delay(200)
                .duration(400))
                .attr('transform', function (d) {
                    var x = d[0],
                        x_out = chart.x_scale(x);
                    if ( chart.focused_member === d[8] ) {
                        chart.persistip.updatePosition(x_out, d3.select(this).select('circle').attr('cy'));
                    }
                    return 'translate(' + (x === chart.x_in_max ? x_out - chart.bar_width : x_out) + ',0)'
                });
            if ( ! immediate ) {
                selection.each('start', function () {
                    if ( counter == 1 ) {
                        chart.dispatcher.start('zoom');
                    }
                })
                    .each('end', function () {
                        if ( counter === count) {
                            chart.dispatcher.end('zoom');
                        } else {
                            counter += 1;
                        }
                    });
            }
            return this;
        },
        /**
         * Render the members elements in the standard form for when the chart is in the foreground of the view.
         * Currently not fully implemented and not in use
         *
         * @memberof MembersChart
         * @param [bar_width] {Number} the width of the members' bars - defaults to 8
         * @return {MembersChart}
         */
        foreground      : function (bar_width) {
            this.bar_width = bar_width || 8;
            this.member_torso = '0 15,0 1,1 1,1 -1,3 -1,3 1,5 1,5 -1,7 -1,7 1,8 1,8 15';

            this.selection.all.select('.active').call(this.renderElement, this, true);
            this.selection.all.select(':not(.active)').call(this.renderElement, this, false);

            return this;
        },
        /**
         * Render the members elements in a lighter form for when the chart is in the background of
         * another chart, i.e. the parties chart.
         * Currently not fully implemented and not in use
         *
         * @memberof MembersChart
         * @param [bar_width] {Number} the width of the members' bars - defaults to 4
         * @return {MembersChart}
         */
        background      : function (bar_width) {
            this.bar_width = bar_width || 4;
            this.member_torso = '0 15,0 0,4 0,4 15';

            this.selection.all.select('.active').call(this.renderElement, this, true);
            this.selection.all.select(':not(.active)').call(this.renderElement, this, false);

            return this;
        },
        /**
         * Shows tooltip.
         *
         * @memberof MembersChart
         * @param data {Object} a single element's data representation
         * @param element {d3.selection} a single element wrapped as a d3.selection
         * @param [is_persist] {Boolean} whether this is a persistent tooltip or just the one used for hover effect
         * @return {MembersChart}
         */
        showDetails     : function (data, element, is_persist) {
            // if trying to show the non persistent tooltip of an already focused member bail out
            if ( this.focused_member === data[8] && ! is_persist ) { return this; }
            // get content
            var content = data[3],
            // get the x positino from the transform attribute and add half bar width
                x = +element.attr('transform').split('(')[1].split(',')[0].replace(/[^\d\.]/g, '') + this.bar_width / 2,
            // get the y position of the member's head
                y = element.select('circle').attr('cy');
            // show the tooltip
            (is_persist ? this.persistip : this.tooltip).showTooltip(content, this.color_scale(data[0]), x | 0, y | 0, data[6]);
            return this;
        },
        /**
         * Hides the tooltip(s).
         *
         * @memberof MembersChart
         * @param d {d3.selection.data} a data object of the selected member
         * @param both {Boolean} whether to also hide the persistent tooltip
         * @return {MembersChart}
         */
        hideDetails     : function (d, both) {
            if ( ! d || this.focused_member !== d[8] && both ) {
                this.persistip.hideTooltip();
            }
            this.tooltip.hideTooltip();
            return this;
        }
    });

    /**
     * Renders the members data in a miniature scale for the zoom button.
     * This serves as a preview of the state that will appear after clicking the button.
     * This is esentially the same as {@link MembersChart}.
     *
     * @constructor
     * @name ButtonChart
     * @extends MembersChart
     * @param options {Object} configuration object for the ButtonChart instance
     */
    function ButtonChart (options) {
        var _self = this;
        Chart.call(this, options);
        this.bar_width = options.bar_width || 1;
        this.stroke = options.stroke || 0;
        this.element = 'rect';
        this.selector = '.mini-member';
        this.parties_toggle = {};
        this.no_color_axis_images = true;

        this.svg.append('defs');
    }

    // ButtonChart class inheritable properties and methods
    /**
     *  first we extend {@link MembersChart}.
     */
    ButtonChart.prototype = extend(Object.create(MembersChart.prototype), {
        constructor : ButtonChart,
        /**
         * Renders an element in the chart.
         * This method is to be used in the `selection.call(method)` way of invocation.
         *
         * @memberof ButtonChart
         * @param selection {d3.selection} a selection over elements in the chart
         * @param chart {ButtonChart} alias for this
         */
        renderElement   : function (selection, chart) {
            selection.attr('class', chart.selector.slice(1))
                .attr('x', function(d) {
                    return chart.x_scale(d[0]);
                })
                .attr('y', function(d) {
                    return chart.y_scale(d[1]);
                })
                .attr('width', chart.bar_width)
                .attr('height', function (d) {
                    return chart.height - chart.padding.y - chart.y_scale(d[1]);
                })
                .attr('fill', function(d) {
                    return chart.color_scale(d[0]);
                });
        },
        /**
         * Renders the chart.
         * If `complete` is `false` it does basic rendering but keeps the graph hidden, preparing it
         * for later call of {@link ButtonChart.transition}.
         * If `complete` is `true` draws the chart completely according to data.
         *
         * @memberof ButtonChart
         * @param [complete] {Boolean} whether to draw the chart completely or keep the graph heidden for later transitioning
         * @return {ButtonChart}
         */
        render          : function (complete) {
            // an interface for selecting elements
            this.selection = {
                // gets all members' elements
                all         : null,
                // get all members' of a party by its `id`
                getParty    : function (id) {
                    if ( !(id in this.parties) ) {
                        this.parties[id] = this.all.filter(function (d, i) {
                            return d[5] === id;
                        });
                    }
                    return this.parties[id];
                },
                // get a member by `id`
                getMember   : function (id) {
                    return this.all.filter(function (d) {
                        return d[8] === id;
                    });
                },
                // parties cache
                parties     : {}
            };
            // prepare chart
            this.setScales().createColorAxis();
            // render elements
            this.selection.all = this.svg.selectAll(this.selector)
                .data(this.data)
                .enter()
                // add the member's rectangle
                .append(this.element)
                .call(this.renderElement, this, complete);

            return this;
        },
        /**
         * Transforms the chart's elements in and out of view.
         * This method is to be used in the `selection.call(method)` way of invocation.
         * Since there's no need for a transition here it simply updates the elements accordingly without a transition.
         *
         * @memberof ButtonChart
         * @param selection {d3.selection} a selection over elements in the chart
         * @param chart {ButtonChart} alias for this
         * @param [transit_out] {Boolean} whether this transition is done into or out of view
         */
        transition      : function (selection, chart, transit_out) {
            // change y position and height
            selection.attr('y', transit_out ? chart.height - chart.padding.y : function (d) {
                return chart.y_scale(d[1]);
            })
                .attr('height', transit_out ? 0 : function (d) {
                return chart.height - chart.padding.y - chart.y_scale(d[1]);
            });
        },
        /**
         * Toggles chart's zoom level between the absolute scope (-100, 100)
         * or total members' scope (minimum, maximum) of given scores in case we're in parties view.
         * In case we're in members view it toggles between absolute and party's scope (minimum, maximu) of
         * its members.
         *
         * @memberof ButtonChart
         * @param is_in {Boolean} whether zooming in
         * @param immediate {Boolean} whether to zoom immediately without transitioning
         * @return {ButtonChart}
         */
        zoom            : function (is_in, immediate) {
            var chart = this,
                getScore = prop(0),
                selection, scope, count;
            // if `is_in` is not specified then toggle state
            if ( ! arguments.length ) {
                is_in = ! this.zoom_in;
            }
            else if ( typeof is_in == 'string' ) {
                scope = is_in;
                is_in = true;
            }
            // set state
            this.zoom_in = is_in;
            // set data according to scope
            if ( is_in && scope !== 'all' ) {
                this.data = this.selection.current.data();
            }
            else {
                this.data = this.selection.all.data();
            }
            is_in ?
                this.setXDomain(d3.min(this.data, getScore), d3.max(this.data, getScore)) :
                this.setXDomain(-100, 100);
            this.setRanges()
                .setXScale()
                .createColorAxis()
                // change data to new selection and redraw the selected party
                .svg.data(this.data)
                .selectAll(this.selector)
                .attr('x', function (d) {
                    var x = d[0],
                        x_out = chart.x_scale(x);
                    return x_out === chart.x_out_max ? x_out - chart.bar_width : x_out;
                })
                .attr('fill', function (d) {
                    return chart.color_scale(d[0]);
                });
            return this;
        }
    });

    // export the chart classes
    return {
        PartiesChart: PartiesChart,
        MembersChart: MembersChart,
        ButtonChart : ButtonChart
    };
});