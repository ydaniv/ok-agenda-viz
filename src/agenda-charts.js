define(['../lib/d3.v2'], function () {

    // some utilities
    function prop (prop) {
        return function (obj) {
            return obj[prop];
        }
    }
    function extend (target, source) {
        var k;
        for ( k in source ) {
            target[k] = source[k];
        }
        return target;
    }

    var d3 = window.d3;

    function Chart (options) {
        this.setData(options.data);
        // set chart dimensions
        this.height = options.height || 200;
        this.width = options.width || 500;
        this.padding = options.padding || {
            x   : 30,
            y   : 30
        };
        this.ranges = options.ranges;
        this.mouseover = options.mouseover;
        this.mouseout = options.mouseout;
        this.click = options.click;
        this.no_axes = options.no_axes;
        // create the chart's canvas
        this.svg = options.svg || d3.select(options.container || 'body')
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height);
        // cache for tooltips
        this.tooltips = {};
    }

    Chart.prototype = {
        constructor     : Chart,
        setXDomain      : function () {
            // create a score accessor
            var getScore = prop(0);
            // set X scale min, max and median
            this.x_in_min = d3.min(this.data, getScore);
            this.x_in_max = d3.max(this.data, getScore);
            this.x_in_med = 0;
//            this.x_in_med = (this.x_in_min + this.x_in_max)/2;
//            this.x_med = d3.median(this.data, getScore);
//            this.x_med = d3.mean(this.data, getScore);
            return this;
        },
        setYDomain      : function () {
            // set Y scale min and max
            this.y_in_min = 0;
            this.y_in_max = d3.max(this.data, prop(1)); // by volume
            return this;
        },
        setDomains      : function () {
            this.setXDomain()
                .setYDomain();
            return this;
        },
        setXScale       : function () {
            // set X scale
            this.x_scale = d3.scale.linear()
                .domain([this.x_in_min, this.x_in_max])
                .range([this.x_out_min, this.x_out_max]);
            return this;
        },
        setYScale       : function () {
            // set Y scale
            this.y_scale = d3.scale.linear()
                .domain([this.y_in_min, this.y_in_max])
                .range([this.y_out_min, this.y_out_max]);
            // set ranges' values
            return this;
        },
        setColorScale   : function () {
            // set the color scale
            this.color_scale = d3.scale.linear()
                .domain([this.x_in_min, this.x_in_med, this.x_in_max])
                .range(['red', 'gray', 'green']);
            return this;
        },
        setScales       : function () {
            this.setDomains()
                .setRanges()
                .setXScale()
                .setYScale()
                .setColorScale();
            return this;
        },
        createAxes      : function () {
            if ( ! this.no_axes ) {
                // create X axis
                this.x_axis = d3.svg.axis();
                this.x_axis.scale(this.x_scale);
                // create Y axis
    //            this.y_axis = d3.svg.axis();
    //            this.y_axis.scale(this.y_scale).orient('right');
                // draw axes
                this.svg.call(this.x_axis);
    //            this.svg.call(this.y_axis);
            }
            return this;
        },
        addEvents       : function () {
            this.svg.selectAll(this.element).on('mouseover', this.mouseover, false)
                                            .on('mouseout', this.mouseout, false)
                                            .on('click', this.click, false);
            return this;
        },
        draw            : function () {
            if ( ! this.selection ) {
                this.render()
                    .selection.all.call(this.transition, this);
            }
            else {
                this.svg.data(this.data).selectAll(this.element);
//                all.exit().call(this.transition, this, true);
//                all.enter().call(this.transition, this);
            }
            return this;
        },
        tooltip         : function (selection, chart, text_index) {
            var name = selection.data()[0][text_index],
                tip;
            if ( ! (name in chart.tooltips) ) {
                tip = selection.append('title')
                    .text(name);
                chart.tooltips[name] = tip;
            }
            else {
                tip = chart.tooltips[name];
            }
//            tip.transition()
//               .duration(300)
//               .attr('opacity', 1);
        }
    };

    function PartiesChart (options) {
        var chart = this;
        Chart.call(this, options);
        this.element = 'circle';
    }

    PartiesChart.prototype = extend(Object.create(Chart.prototype), {
        constructor : PartiesChart,
        setData     : function (data) {
            this.data = data.map(function(party) {
                // value | 0 is the same as Math.round(value)
                return [
                    party.score | 0, //0
                    party.volume | 0,//1
                    party.size | 0,  //2
                    party.name,      //3
                    party.id         //4
                ];
            }).sort(function (a, b) {
                // sort from the large to the small ones, to make sure they don't cover each other entirely
                return b[2] - a[2];
            });
            return this;
        },
        setRanges   : function (x_min, x_max, y_min, y_max, r_min, r_max) {
            // if ranges was set in options
            if ( this.ranges && ! this.ranges_set ) {
                this.ranges_set = true;
                // use it to override the defaults
                return this.setRanges.apply(this, this.ranges);
            }
            this.x_out_min = x_min == null ? this.padding.x + this.r_in_max * 2 : x_min;
            this.x_out_max = x_max == null ? this.width - this.padding.x - this.r_in_max * 2 : x_max;
            this.y_out_min = y_min == null ? this.height - this.padding.y - this.r_in_max * 2 : y_min;
            //TODO: just placing them in the middle for now until we have proper volume - then change range's max
            this.y_out_max = y_max == null ? this.height / 2 : y_max;
            this.r_out_min = r_min == null ? this.r_in_min * 2 : r_min;
            this.r_out_max = r_max == null ? this.r_in_max * 2 : r_max;
            return this;
        },
        setScales   : function () {
            var getSize = prop(2);
            // set R scale min and max
            this.r_in_max = d3.max(this.data, getSize);
            this.r_in_min = d3.min(this.data, getSize);
            Chart.prototype.setScales.call(this);
            // set R scale
            this.r_scale = d3.scale.linear()
                .domain([this.r_in_min, this.r_in_max])
                .range([this.r_out_min, this.r_out_max]);
            return this;
        },
        render      : function (complete) {
            var chart = this;

            this.selection = {
                all     : null
            };
            this.selection.all = this.setScales()
                .createAxes()
                .svg.selectAll(this.element)
                .data(this.data)
                .enter()
                // add the parties' circles
                .append(this.element)
                // position the circles
                //TODO: make sure they don't cover each other
                .attr('cx', function(d) {
                    return chart.x_scale(d[0]);
                })
                .attr('cy', function(d) {
                    return chart.y_scale(d[1]);
                })// if not `complete` then radii initially set to 0 and then transitioned
                .attr('r', ! complete ? 0 : function (d) {
                    chart.r_scale(d[2]);
                })
                // paint
                .attr('fill', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('fill-opacity', .7)
                .attr('stroke', '#222222');
            this.addEvents();
            return this;
        },
        transition  : function (selection, chart, transit_out) {
            // transition the radii of all circles
            selection.transition()
                .duration(750)
                .delay(transit_out ? 0 : function(d, i) {
                    return i * 50;
                })
                .attr('r', transit_out ? 0 : function(d) {
                    return chart.r_scale(d[2]);
                });
            return chart;
        }
    });

    function MembersChart (options) {
        Chart.call(this, options);
        this.bar_padding = options.bar_padding || 1;
        this.stroke = options.stroke || 1;
        this.element = 'rect';
        this.parties_toggle = {};
        this.zoom_in = false;
    }

    MembersChart.prototype = extend(Object.create(Chart.prototype), {
        constructor : MembersChart,
        setData     : function (data) {
            this.data = data.map(function(member) {
                return [
                    member.score,   //0
                    member.volume,  //1
                    member.rank,    //2
                    member.name,    //3
                    member.party,   //4
                    member.party_id,//5
                    member.id       //6
                ];
            }).sort(function (a, b) {
                return a[0] - b[0];
            });
            return this;
        },
        setRanges   : function (x_min, x_max, y_min, y_max) {
            // if ranges was set in options
            if ( this.ranges && ! this.ranges_set ) {
                this.ranges_set = true;
                // use it to override the defaults
                return this.setRanges.apply(this, this.ranges);
            }
            this.x_out_min = x_min == null ? this.padding.x : x_min; 
            this.x_out_max = x_max == null ? this.width - this.padding.x : x_max; 
            this.y_out_min = y_min == null ? this.height - this.padding.y : y_min; 
            this.y_out_max = y_max == null ? this.padding.y : y_max; 
            return this;
        },
        render      : function (complete) {
            var chart = this,
                w = this.width / this.data.length,
                bar_width = (w - chart.bar_padding - chart.stroke) | 0 || 1;

            this.selection = {
                all     : null,
                getParty: function (id) {
                    if ( !(id in this.parties) ) {
                        this.parties[id] = this.all.filter(function (d, i) {
                            return d[5] === id;
                        });
                    }
                    return this.parties[id];
                },
                parties : {}
            };
            this.selection.all = this.setScales()
                .createAxes()
                .svg.selectAll(this.element)
                .data(this.data)
                .enter()
                // add the member's rectangle
                .append(this.element)
                .attr('x', function(d, i) {
                    return chart.x_scale(d[0]);
                })
                .attr('y', ! complete ? chart.height - chart.padding.y : function(d) {
                    return chart.y_scale(d[1]);
                })
                .attr('width', bar_width)
                // if not `complete` then height starts at 0 and then transitioned according to chart height and y_scale
                .attr('height', ! complete ? 0 : function(d) {
                    return chart.height - chart.padding.y - chart.y_scale(d[1]);
                })
                .attr('fill', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('stroke', function(d) {
                    return chart.color_scale(d[0]);
                });
            if ( complete ) {
                this.parties_toggle[0] = true;
                this.select();
            }
            this.addEvents();
            return this;
        },
        select      : function (id, dont_set) {
            var selection = arguments.length ? this.selection.getParty(id) : this.selection.all;
            if ( ! dont_set ) {
                this.selection.current = selection;
            }
            return selection;
        },
        toggle      : function (party, show_hide) {
            var id;
            // if party is NOT party_id but a selection
            id = typeof party === 'number' ? party : party.data()[0][5];
            // toggle state
            this.parties_toggle[id] = ! this.parties_toggle[id];
            // whether to also turn on/off visual state
            if ( show_hide ) {
                this.parties_toggle[id] ? this.show(id, true) : this.hide(id, true);
            }
            return this;
        },
        show        : function (party, override_persist) {
            var id;
            // if party is NOT party_id but a selection
            id = typeof party === 'number' ? party : party.data()[0][5];
            // get old state
            // if we're allowed to toggle the persistent state or it's not persistent
            if ( override_persist || ! this.parties_toggle[id] ) {
                // turn on persistency if `override_persist` is `true`
                override_persist && (this.parties_toggle[id] = true);
                // if toggling to active then select
                this.select(id)
                    // transition in or out according to new state - `true` => 'out'
                    .call(this.transition, this);
            }
            return this;
        },
        hide        : function (party, override_persist) {
            var id;
            // if party is NOT party_id but a selection
            id = typeof party === 'number' ? party : party.data()[0][5];
            // get old state
            // if we're allowed to toggle the persistent state or it's not persistent
            if ( override_persist || ! this.parties_toggle[id] ) {
                // disable persistency if `override_persist is `true`
                override_persist && (this.parties_toggle[id] = false);
                // if toggling to active then select
                this.select(id, true)
                    // transition in or out according to new state - `true` => 'out'
                    .call(this.transition, this, true);
            }
            return this;
        },
        transition  : function (selection, chart, transit_out) {
            // transition the radii of all circles
            selection.transition()
                .duration(750)
                .delay(function(d, i) {
                    return i * 10;
                }).attr('height', transit_out ? 0 : function(d) {
                    return chart.height - chart.padding.y - chart.y_scale(d[1]);
                }).attr('y', transit_out ? chart.height - chart.padding.y : function(d) {
                    return chart.y_scale(d[1]);
                });
            return chart;
        },
        zoom        : function (is_in) {
            //TODO: add transition to scale change
            //TODO: separate selection for scaling from selection for drawing - to be able to scale one party to global context
            var chart = this,
                changing_state = this.zoom_in ^ is_in;
            if ( is_in ) {
                this.data = this.selection.current.data();
            }
            else {
                this.data = this.selection.all.data();
            }
            // need to separate scales and only zoom on X and color (not Y)
            this.setScales().createAxes();
            // change data to new selection and redraw the selected party
            this.svg.data(this.data).selectAll(this.element).attr('x', function(d, i) {
                return chart.x_scale(d[0]);
            });
//            this.draw();
            return this;
        }
    });

    return {
        PartiesChart: PartiesChart,
        MembersChart: MembersChart
    };
});