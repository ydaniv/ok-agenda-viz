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
            .attr("width", this.width)
            .attr("height", this.height);
    }

    Chart.prototype = {
        constructor : Chart,
        setScales   : function () {
            // create a score accessor
            var getScore = prop(0);
            // set X scale min, max and median
            this.x_in_min = d3.min(this.data, getScore);
            this.x_in_max = d3.max(this.data, getScore);
            this.x_in_med = 0;
//            this.x_in_med = (this.x_in_min + this.x_in_max)/2;
//            this.x_med = d3.median(this.data, getScore);
//            this.x_med = d3.mean(this.data, getScore);
            // set Y scale min and max
            this.y_in_min = 0;
            this.y_in_max = d3.max(this.data, prop(1)); // by volume
            // set ranges' values
            this.setRanges();
            // set X scale
            this.x_scale = d3.scale.linear()
                .domain([this.x_in_min, this.x_in_max])
                .range([this.x_out_min, this.x_out_max]);
            // set Y scale
            this.y_scale = d3.scale.linear()
                .domain([this.y_in_min, this.y_in_max])
                .range([this.y_out_min, this.y_out_max]);
            // set the color scale
            this.color_scale = d3.scale.linear()
                .domain([this.x_in_min, this.x_in_med, this.x_in_max])
                .range(['red', 'gray', 'green']);
            return this;
        },
        createAxes  : function () {
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
        addEvents   : function () {
            this.svg.selectAll(this.element).on('mouseover', this.mouseover, false);
            this.svg.selectAll(this.element).on('mouseout', this.mouseout, false);
            this.svg.selectAll(this.element).on('click', this.click, false);
            return this;
        },
        draw        : function () {
            var all, exit, enter;
            if ( ! this.selection ) {
                this.initDraw()
                    .selection.all.call(this.transition, this);
            }
            else {
                all = this.svg.selectAll(this.element)
                    .data(this.data);
                all.exit().call(this.transition, this, true);
                all.enter().call(this.transition, this);
            }
            return this;
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
                    party.score | 0,
                    party.volume | 0,
                    party.size | 0,
                    party.name
                ];
            }).sort(function (a, b) {
                // sort from the large to the small ones, to make sure they don't cover each other entirely
                return b[2] - a[2];
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
            this.x_out_min = x_min == null ? this.padding.x + this.r_in_max * 2 : x_min;
            this.x_out_max = x_max == null ? this.width - this.padding.x - this.r_in_max * 2 : x_max;
            this.y_out_min = y_min == null ? this.height - this.padding.y - this.r_in_max * 2 : y_min;
            //TODO: just placing them in the middle for now until we have proper volume - then change range's max
            this.y_out_max = y_max == null ? this.height / 2 : y_max;
            return this;
        },
        setScales   : function () {
            var getSize = prop(2);
            // set R scale min and max
            this.r_in_max = d3.max(this.data, getSize); // by size
            this.r_in_min = d3.min(this.data, getSize); // by size
            Chart.prototype.setScales.call(this);
            // set R scale
            this.r_scale = d3.scale.linear()
                .domain([this.r_in_min, this.r_in_max])
                .range([this.r_in_min * 2, this.r_in_max * 2]);
            return this;
        },
        initDraw    : function () {
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
                .attr("cx", function(d) {
                    return chart.x_scale(d[0]);
                })
                .attr("cy", function(d) {
                    return chart.y_scale(d[1]);
                })// radii initially set to 0 and then transitioned
                .attr("r", function(d) {
                    return 0;
                })
                // paint
                .attr("fill", function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr("fill-opacity", function(d) {
                    return .7;
                })
                .attr("stroke", function(d) {
                    return '#222222';
                });
            this.addEvents();
            return this;
        },
        transition  : function (selection, chart, transit_out) {
            // transition the radii of all circles
            selection.transition()
                .duration(750)
                .delay(function(d, i) {
                    return transit_out ? 0 : i * 50;
                })
                .attr("r", function(d) {
                    return transit_out ? 0 : chart.r_scale(d[2]);
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
    }

    MembersChart.prototype = extend(Object.create(Chart.prototype), {
        constructor : MembersChart,
        setData     : function (data) {
            this.data = data.map(function(member) {
                return [
                    member.score,
                    member.volume,
                    member.rank,
                    member.name,
                    member.party
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
        initDraw    : function () {
            var chart = this,
                w = this.width / this.data.length,
                bar_width = (w - chart.bar_padding - chart.stroke) | 0 || 1;

            this.selection = {
                all     : null,
                parties : {}
            };
            this.selection.all = this.setScales()
                .createAxes()
                .svg.selectAll(this.element)
                .data(this.data)
                .enter()
                // add the member's rectangle
                .append(this.element)
                .attr("x", function(d, i) {
//                    return chart.padding.x + i * w;
                    return chart.x_scale(d[0]);
                })
                .attr("y", function(d) {
                    return chart.height - chart.padding.y;
                })
                .attr("width", function(d) {
                    return bar_width;
                })
                .attr("height", function(d) {
                    return 0;
                })
                .attr("fill", function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr("stroke", function(d) {
                    return chart.color_scale(d[0]);
                });
            this.addEvents();
            return this;
        },
        transition  : function (selection, chart, transit_out) {
            // transition the radii of all circles
            selection.transition()
                .duration(750)
                .delay(function(d, i) {
                    return i * 10;
                }).attr("height", function(d) {
                    return transit_out ? 0 : chart.height - chart.padding.y - chart.y_scale(d[1]);
                }).attr("y", function(d) {
                    return transit_out ? chart.height - chart.padding.y : chart.y_scale(d[1]);
                });
            return chart;
        }
    });

    return {
        PartiesChart: PartiesChart,
        MembersChart: MembersChart
    }
});