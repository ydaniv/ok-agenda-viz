define(['d3', 'agenda-tooltips'], function (disregard, Tooltip) {
    if (!Object.create) {
        Object.create = function (proto, props) {
            function F () {}
            F.prototype = proto;
            return new F();
        }
    }
    // some utilities
    function prop (p) {
        return function (obj) {
            return obj[p];
        };
    }
    function extend (target, source) {
        var k;
        for ( k in source ) {
            target[k] = source[k];
        }
        return target;
    }
    function defined (arg, def) {
        return arg == null ? def : arg;
    }

    var d3 = window.d3;

    function Chart (options) {
        var chart = this,
            parent_node;
        this.setData(options.data);
        // create the chart's canvas
        this.svg = options.svg || d3.select(options.container || 'body').append('svg');
        // fix bug in FF - `svg` element has no `offsetParent` property
        // fix bug in IE9- - doesn't have neither
        parent_node = this.svg[0][0].offsetParent || this.svg[0][0].parentElement || this.svg[0][0].parentNode;
        // set chart dimensions
        this.height = options.height || parent_node.offsetHeight;
        this.width = options.width || parent_node.offsetWidth;
        this.padding = options.padding || {
            x   : 40,
            y   : 15
        };
        this.domains = options.domains;
        this.ranges = options.ranges;
        this.mouseover = function(d,i) {
            if ( ! chart.events_disabled ) {
                chart.showDetails(d, d3.select(this));
                options.mouseover && options.mouseover.call(this, d, i);
            }
        };
        this.mouseout = function(d, i) {
            if ( ! chart.events_disabled ) {
                chart.hideDetails(d);
                options.mouseout && options.mouseout.call(this, d, i);
            }
        };
        this.click = options.click;
        this.touchstart = options.touchstart;
        this.no_axes = options.no_axes;
        this.dispatcher = d3.dispatch('start', 'end');
        // set canvas width and height
        this.svg.attr('width', this.width)
                .attr('height', this.height);
        if ( options.id ) {
            this.svg.attr('id', options.id);
            this.id = options.id;
        }
    }

    Chart.prototype = {
        constructor     : Chart,
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
                .range(['red', 'gray', '#39B54A']);
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
        createColorAxis : function () {
            var color_axis;
            // create the color axis
            if ( ! this.color_grad ) {
                this.color_grad = this.svg.select('defs').append('linearGradient')
                    .attr('id', (this.id ? this.id + '-' : '') + 'color-axis');

                color_axis = IE8_COMPAT_MODE ? this.svg : this.svg.append('g');

                color_axis.append('rect')
                    .attr('x', this.padding.x)
                    .attr('y', this.y_out_min)
                    .attr('height', '2px')
                    .attr('width', this.width - (2 * this.padding.x))
                    .attr('stroke-width', '0px')
                    .attr('fill', 'url(#' + (this.id ? this.id + '-' : '') + 'color-axis)');
                if ( ! this.no_color_axis_images ) {
                    // add '-' image
                    color_axis.append('image')
                        // image is 10x10 + 1px margin
                        .attr('x', this.padding.x - 11)
                        .attr('y', this.y_out_min - 4)
                        .attr('width', 10)
                        .attr('height', 10)
                        .attr('xlink:href', '/src/img/icons/i_minus.png');
                    // add '+' image
                    color_axis.append('image')
                        // image is 10x10 + 1px margin
                        .attr('x', this.width - this.padding.x + 1)
                        .attr('y', this.y_out_min - 4)
                        .attr('width', 10)
                        .attr('height', 10)
                        .attr('xlink:href', '/src/img/icons/i_plus.png');
                }
            }
            this.color_grad.selectAll('stop').remove();
            this.color_grad.append('stop').attr('stop-color', this.color_scale(this.x_in_min)).attr('offset', '0%');
            // if the X Domain's min and max are around the middle (0) 
            if ( this.x_in_min < this.x_in_med && this.x_in_med < this.x_in_max ) {
                // then add a middle color stop (to gray)
                this.color_grad.append('stop').attr('stop-color', this.color_scale(this.x_in_med)).attr('offset', ((((this.x_in_med - this.x_in_min)/(this.x_in_max - this.x_in_min)) * 100) | 0) + '%');
            }
            this.color_grad.append('stop').attr('stop-color', this.color_scale(this.x_in_max)).attr('offset', '100%');
            return this;
        },
        createAxes      : function () {
            var n, dy;
            if ( ! this.no_axes ) {
                if ( this.x_axis ) {
                    this.x_axis.remove();
                } 
                // create X axis
                this.x_axis = this.svg.insert('line', ':first-child')
                    .attr('x1', this.x_scale(0))
                    .attr('y1', 0)
                    .attr('x2', this.x_scale(0))
                    .attr('y2', this.height)
                    .attr('stroke', '#E6E6E6')
                    .attr('stroke-width', 1);

                // create the Y axis
                if ( ! this.y_axis ) {
                    this.y_axis = IE8_COMPAT_MODE ? this.svg : this.svg.append('g');
                    dy = (this.height - 2 * this.padding.y) / 20;
                    for ( n = 1; n < 21 ; n++ ) {
                        this.y_axis.append('line')
                            .attr('x1', 0)
                            .attr('y1', n * dy)
                            .attr('x2', this.width)
                            .attr('y2', n * dy)
                            .attr('stroke', '#D9EEFD')
                            .attr('stroke-width', 1)
                            .attr('stroke-dasharray', '6,3');
                    }
                }

                this.createColorAxis()
            }
            return this;
        },
        addEvents       : function () {
            this.svg.selectAll(this.selector).on('mouseover', this.mouseover, false)
                                            .on('mouseout', this.mouseout, false)
                                            .on('click', this.click, false)
                                            .on('touchstart', this.touchstart, false);
            return this;
        },
        toggleEvents    : function (on) {
            this.events_disabled = !on;
            this.svg.classed('no-events', !on);
            return this;
        },
        draw            : function () {
            if ( ! this.selection ) {
                this.render()
                    .selection.all.call(this.transition, this);
            }
            else {
                this.svg.data(this.data).selectAll(this.selector);
            }
            return this;
        }
    };

    function PartiesChart (options) {
        Chart.call(this, options);
        this.element = 'circle';
        this.selector = '.party';
    }

    PartiesChart.prototype = extend(Object.create(Chart.prototype), {
        constructor : PartiesChart,
        setData     : function (data) {
            //# Array.prototype.map
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
            this.x_out_min = defined(x_min, this.padding.x);
            this.x_out_max = defined(x_max, this.width - this.padding.x);
            this.y_out_min = defined(y_min, this.height - this.padding.y);
            this.y_out_max = defined(y_max, this.padding.y);
            this.r_out_min = defined(r_min, this.r_in_min * 2);
            this.r_out_max = defined(r_max, this.r_in_max * 2);
            return this;
        },
        setRDomain  : function () {
            var getSize = prop(2);
            // set R scale min and max
            this.r_in_max = d3.max(this.data, getSize);
            this.r_in_min = d3.min(this.data, getSize);
            return this;
        },
        setRScale   : function () {
            // set R scale
            this.r_scale = d3.scale.linear()
                .domain([this.r_in_min, this.r_in_max])
                .range([this.r_out_min, this.r_out_max]);
            return this;
        },
        setScales   : function () {
            this.setRDomain();
            Chart.prototype.setScales.call(this);
            this.setRScale();
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
                .attr('class', this.selector.slice(1))
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
                .attr('fill-opacity', 0)
                .attr('stroke', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('stroke-width', '4px');
            this.tooltip = Tooltip(this.svg);
            this.persistip = Tooltip(this.svg);
            this.addEvents();
            return this;
        },
        transition  : function (selection, chart, transit_out, callback) {
            var count = selection.length, counter = 1;
            // transition the radii of all circles
            selection.transition()
                .duration(200)
                .delay(transit_out ? 0 : function(d, i) {
                    return i * 50;
                })
                .attr('r', transit_out ? 0 : function(d) {
                    return chart.r_scale(d[2]);
                }).each('start', function () {
                    if ( counter == 1 ) {
                        chart.toggleEvents(false);
                        chart.dispatcher.start('toggle');
                    }
                })
                .each('end', function () {
                    if ( counter === count) {
                        transit_out || chart.toggleEvents(true);
                        chart.dispatcher.end('toggle');
                        callback && callback();
                    } else {
                        counter += 1;
                    }
                });
            if ( transit_out ) {
                chart.hideDetails();
            }
        },
        zoom        : function (is_in) {
            var chart = this,
                count = this.selection.all.length, counter = 1;
            // if `is_in` is not specified then toggle state
            if ( ! arguments.length ) {
                is_in = ! this.zoom_in;
            }
            // set state
            this.zoom_in = is_in;
            is_in ?
                this.setXDomain() :
                this.setXDomain(-100, 100);
            this.setRanges()
                .setXScale()
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
                            chart.toggleEvents(false);
                            chart.dispatcher.start('zoom');
                        }
                    })
                    .each('end', function () {
                        if ( counter === count) {
                            chart.toggleEvents(true);
                            chart.dispatcher.end('zoom');
                        } else {
                            counter += 1;
                        }
                    });
            return this;
        },
        showDetails : function (data, element) {
            var content = data[3],
                x = +element.attr('cx'),
                cy = +element.attr('cy'),
                r = +element.attr('r'),
                y = cy - r,
                alter_y = cy + r
            return this.tooltip.showTooltip(content, this.color_scale(data[0]), x | 0, y | 0, null, alter_y);
        },
        hideDetails : function () {
            return this.tooltip.hideTooltip();
        }
    });

    function MembersChart (options) {
        var _self = this;
        Chart.call(this, options);
        this.bar_width = options.bar_width || 8;
        this.stroke = options.stroke || 0;
        this.element = 'g';
        this.selector = '.member';
        this.parties_toggle = {};
        this.zoom_in = false;
        this.member_torso = '0 10,0 1,1 1,1 -1,3 -1,3 1,5 1,5 -1,7 -1,7 1,8 1,8 10';
//        this.member_torso = '0 15,0 0,4 0,4 15';
        this.volume_threshold = .15;

        this.svg.append('defs');
    }

    MembersChart.prototype = extend(Object.create(Chart.prototype), {
        constructor     : MembersChart,
        setData         : function (data) {
            //# Array.prototype.map
            this.data = data.map(function(member) {
                return [
                    member.score | 0,   //0
                    member.volume | 0,  //1
                    member.rank,        //2
                    member.name,        //3
                    member.party,       //4
                    member.party_id,    //5
                    member.img_url,     //6
                    member.absolute_url,//7
                    member.id           //8
                ];
            }).sort(function (a, b) {
                // sort from the higher to the lower ones, to make sure they don't cover each other entirely
                return b[1] - a[1];
            });
            return this;
        },
        setRanges       : function (x_min, x_max, y_min, y_max) {
            // if ranges was set in options
            if ( this.ranges && ! this.ranges_set ) {
                this.ranges_set = true;
                // use it to override the defaults
                return this.setRanges.apply(this, this.ranges);
            }
            this.x_out_min = defined(x_min, this.padding.x); 
            this.x_out_max = defined(x_max, this.width - this.padding.x); 
            this.y_out_min = defined(y_min, this.height - this.padding.y); 
            this.y_out_max = defined(y_max, this.padding.y); 
            return this;
        },
        renderElement   : function (selection, chart, complete) {
            var threshold = (chart.volume_threshold * chart.y_in_max) | 0;
            selection.classed(chart.selector.slice(1), true)
                    .attr('transform', function(d, i) {
                        return 'translate(' + chart.x_scale(d[0]) + ',0)';
                    // for each g element, check if the corresponding member's volume is below or over threshold
                    // and render accordingly
                    }).each(function (d, i) {
                        d3.select(this).call(
                            d[1] < threshold ?
                                chart.renderUnder :
                                chart.renderOver,
                            chart,
                            complete
                        );
                    });
        },
        renderOver      : function (selection, chart, complete) {
            var bar_w = chart.bar_width;
            selection.classed('volume_over', true).classed('active', complete)
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
            selection.append('polygon')
                .attr('points', chart.member_torso)
                .attr('fill', function(d) {
                    return chart.color_scale(d[0]);
                })
                .attr('transform', function (d) {
                    return 'translate(0,' + (complete ? chart.y_scale(d[1]) : chart.height) + ')';
                })
                .style('visibility', complete ? 'visible' : 'hidden');
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
        renderUnder     : function (selection, chart, complete) {
            var half_bar_w = chart.bar_width / 2;
            selection.classed('volume_under', true).classed('active', complete)
                .append('circle')
                    .attr('cx', half_bar_w)
                    .attr('cy', chart.y_out_min + half_bar_w * 2)
                    .attr('stroke', function(d) {
                        return chart.color_scale(d[0]);
                    })
                    .attr('r', ! complete ? 0 : half_bar_w);
        },
        render          : function (complete) {
            var chart = this;

            this.selection = {
                all         : null,
                getParty    : function (id) {
                    if ( !(id in this.parties) ) {
                        this.parties[id] = this.all.filter(function (d, i) {
                            return d[5] === id;
                        });
                    }
                    return this.parties[id];
                },
                getMember   : function (id) {
                    return this.all.filter(function (d) {
                        return d[8] === id;
                    });
                },
                parties     : {}
            };
            this.setScales()
                .createAxes();

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

            this.dispatcher.on('start', function (type, selection, out) {
                if ( type === 'toggle' ) {
                    if ( out ) {
                        // make the event catching rects disappear
                        selection.select('rect')
                                .attr('y', chart.y_out_min)
                                .attr('height', 0);
                    }
                    else {
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

            this.tooltip = Tooltip(this.svg);
            this.persistip = Tooltip(this.svg);
            this.addEvents();
            return this;
        },
        select          : function (id, dont_set) {
            var selection = arguments.length ? this.selection.getParty(id) : this.selection.all;
            if ( ! dont_set ) {
                this.selection.current = selection;
            }
            return selection;
        },
        toggle          : function (party, show_hide) {
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
        single          : function (party, dont_set) {
            var id, pid;
            // if party is NOT party_id but a selection
            id = typeof party === 'number' ? party : party.data()[0][5];
            // if toggling this party to 'on'
            if ( ! this.parties_toggle[id] ) {
                // toggle off all other parties
                for ( pid in this.parties_toggle ) {
                    if ( id != pid ) {
                        this.hide(+pid, true);
                    }
                }
            }
            // toggle this party
            this.toggle(id, dont_set);
            return this;
        },
        show            : function (party, override_persist, callback) {
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
                    .call(this.transition, this, false, callback);
            }
            return this;
        },
        hide            : function (party, override_persist, callback) {
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
                    .call(this.transition, this, true, callback);
            }
            return this;
        },
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
        foreground      : function (bar_width) {
            this.bar_width = bar_width || 8;
            this.member_torso = '0 15,0 1,1 1,1 -1,3 -1,3 1,5 1,5 -1,7 -1,7 1,8 1,8 15';

            this.selection.all.select('.active').call(this.renderElement, this, true);
            this.selection.all.select(':not(.active)').call(this.renderElement, this, false);

            return this;
        },
        background      : function (bar_width) {
            this.bar_width = bar_width || 4;
            this.member_torso = '0 15,0 0,4 0,4 15';

            this.selection.all.select('.active').call(this.renderElement, this, true);
            this.selection.all.select(':not(.active)').call(this.renderElement, this, false);

            return this;
        },
        showDetails     : function (data, element, is_persist) {
            if ( this.focused_member === data[8] && ! is_persist ) { return; }
            var content = data[3],
                x = +element.attr('transform').split('(')[1].split(',')[0].replace(/[^\d\.]/g, '') + this.bar_width / 2,
                y = element.select('circle').attr('cy');
            (is_persist ? this.persistip : this.tooltip).showTooltip(content, this.color_scale(data[0]), x | 0, y | 0, data[6]);
            return this;
        },
        hideDetails     : function (d, both) {
            if ( ! d || this.focused_member !== d[8] && both ) {
                this.persistip.hideTooltip();
            }
            this.tooltip.hideTooltip();
            return this;
        }
    });

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

    ButtonChart.prototype = extend(Object.create(MembersChart.prototype), {
        constructor : ButtonChart,
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
        render          : function (complete) {
            this.selection = {
                all         : null,
                getParty    : function (id) {
                    if ( !(id in this.parties) ) {
                        this.parties[id] = this.all.filter(function (d, i) {
                            return d[5] === id;
                        });
                    }
                    return this.parties[id];
                },
                getMember   : function (id) {
                    return this.all.filter(function (d) {
                        return d[8] === id;
                    });
                },
                parties     : {}
            };
            this.setScales().createColorAxis();

            this.selection.all = this.svg.selectAll(this.selector)
                    .data(this.data)
                    .enter()
                    // add the member's rectangle
                    .append(this.element)
                    .call(this.renderElement, this, complete);

            return this;
        },
        transition      : function (selection, chart, transit_out) {
            selection.attr('y', transit_out ? chart.height - chart.padding.y : function (d) {
                            return chart.y_scale(d[1]);
                        })
                        .attr('height', transit_out ? 0 : function (d) {
                            return chart.height - chart.padding.y - chart.y_scale(d[1]);
                        });
        },
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

    return {
        PartiesChart: PartiesChart,
        MembersChart: MembersChart,
        ButtonChart : ButtonChart
    };
});