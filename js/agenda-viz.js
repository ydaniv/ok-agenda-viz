define(['agenda-charts', 'reqwest', 'when'], function (Charts, Reqwest, When) {

    if (!Object.create) {
        Object.create = function (proto, props) {
            function F () {}
            F.prototype = proto;
            return new F();
        }
    }
    var d3 = window.d3,
        BASE_URL = 'http://oknesset.org',
        agenda_id = (function () {
            var match = window.location.search.match(/agenda_id=(\d+)/i);
            return (match && match[1]) || 2;
        }()),
        OVERRIDE_MEMBERS_CLICK = !!window.location.search.match(/memberjack=1/i),
        HOSTNAME = (function () {
            var match = window.location.search.match(/hostname=([^&]*)/i),
                res = (match && match[1]) || null;
            return res ? decodeURIComponent(res) : res;
        }()),
    // `document.body` in IE8
        window_height = document.body ? document.body.clientHeight : window.innerHeight,
        window_width = document.body ? document.body.clientWidth : window.innerWidth,
        EMBED_SNIPPET = '<iframe width="' +
            window_width +
            '" height="' +
            window_height +
            '" src="' + window.location.href + '"></iframe>',
        Model = {
            get : function (url) {
                var deferred = When.defer(),
                    that = this,
                    cache = this.cache(url);
                if ( cache ) {
                    deferred.resolve(cache);
                }
                else {
                    //TODO: consider using d3.xhr
                    Reqwest({
                        url     : url,
                        type    : 'jsonp',
                        success : function (response) {
                            window.console && console.log(response);
                            that.cache(url, response);
                            deferred.resolve(response);
                        },
                        error   : function () {
                            try {
                                window.console && console.error('Failed to get ' + url, arguments);
                            } catch (e) {alert('Failed to get ' + url);}
                            deferred.reject(arguments[1]);
                        }
                    });
                }
                return deferred.promise;
            },
            cache   : function (key, data) {
                try {
                    if ( arguments.length === 1 ) {
                        return JSON.parse(localStorage.getItem(key));
                    }
                    else {
                        localStorage.setItem(key, JSON.stringify(data));
                    }
                } catch (e) {}
            }
        },
        Parties = Object.create(Model),
        Agenda = Object.create(Model),
        Members = Object.create(Model),
        embed_overlay = d3.select('#embed-overlay'),
        share_overlay = d3.select('#share-overlay'),
        embed_ovelay_on = false,
        share_ovelay_on = false;

    d3.select('#loader-message').text('טוען נתונים...');
    // when.js also wraps the resolved and rejected calls in `try-catch` statements
    When.all(
        [Parties.get('http://oknesset.org/api/v2/party/?callback=?'),
            Agenda.get('http://oknesset.org/api/v2/agenda/' + agenda_id + '/?callback=?'),
            Members.get('http://oknesset.org/api/v2/member/?callback=?')],
        function (responses) {
            var parties = responses[0],
                agenda = responses[1],
                members = responses[2],
                parties_menu = d3.select('#parties-menu'),
                toggle_zoom = d3.select('#toggle-zoom'),
            //# Array.prototype.map
                parties_data = agenda.parties.map(function (item, i) {
                    item.size = parties.objects[i].number_of_seats;
                    item.id = parties.objects[i].id;
                    return item;
                }),
            //# Array.prototype.forEach
                members_data = (agenda.parties.forEach(function (party) {
                    //# Array.prototype.forEach
                    agenda.members.forEach(function (member, i) {
                        if ( party.name === member.party ) {
                            member.party_id = party.id;
                            member.img_url = members.objects[i].img_url;
                            member.id = members.objects[i].id;
                        }
                    });
                }), agenda.members),
                dispatcher = d3.dispatch('change_party'),
                parties_touches = 0,
                parties_chart = new Charts.PartiesChart({
                    data        : parties_data,
                    container   : '#charts',
                    id          : 'parties-canvas',
                    mouseover   : function (party) {
                        var party_id = party[4];
                        members_chart.show(party_id);
                        d3.select(this).transition().delay(200).duration(200).attr('fill-opacity', .4);
                    },
                    mouseout    : function (party) {
                        members_chart.hide(party[4]);
                        d3.select(this).transition().duration(200).attr('fill-opacity', 0);
                    },
                    click       : function (party) {
                        var party_id;
                        if ( ! parties_touches ) {
                            party_id = party[4];
                            // doesn't seem to trigger 'change' event, at least not on chrome
                            parties_menu.property('value', party_id);
                            dispatcher.change_party(party_id);
                        }
                    },
                    touchstart  : function (party) {
                        // just detect that a touch event was triggered to prevent the click handler
                        var parties_touches = d3.touches(parties_chart.svg.node().parentNode).length,
                            party_id = party[4];
                        if ( members_chart.parties_toggle[party_id] ) {
                            // doesn't seem to trigger 'change' event, at least not on chrome
                            parties_menu.property('value', party_id);
                            dispatcher.change_party(party_id);
                        }
                        else {
                            parties_chart.selection.all.attr('fill-opacity', function (d) {
                                return d[4] != party_id ? 0 : .4;
                            });
                            members_chart.single(party_id, true);
                        }
                    },
                    no_axes     : true
                }).draw(),
                openMemberHandler = function (member) {
                    if ( OVERRIDE_MEMBERS_CLICK && HOSTNAME ) {
                        parent.postMessage(member[8], HOSTNAME);
                    } else {
                        window.open(BASE_URL + member[7]);
                    }
                },
                members_touches = 0,
                members_chart = new Charts.MembersChart({
                    data        : members_data,
                    container   : '#charts',
                    id          : 'members-canvas',
                    click       : function (member, i) {
                        if ( ! members_touches ) {
                            openMemberHandler(member);
                        }
                    },
                    touchstart  : function (member, i) {
                        // just detect that a touch event was triggered to prevent the click handler
                        var members_touches = d3.touches(members_chart.svg.node().parentNode).length;
                        if ( members_chart.focused_member === i ) {
                            openMemberHandler(member);
                        }
                        else {
                            members_chart.focused_member = i;
                            members_chart.showDetails(member, d3.select(this));
                        }
                    }
                }).render(),
                parties_view = true;

            // after parties chart was initialised with default X scale domain,
            // set it's X domain to the min/max of members' scores
            parties_chart.domains =[
                d3.min(members_data, function (d) {return d.score;}),
                d3.max(members_data, function (d) {return d.score;})
            ];

            dispatcher.on('change_party', function (party_id) {
                var is_all = !+party_id,
                    zoom_out = function () {
                        members_chart.zoom(parties_chart.zoom_in ? 'all' : false, true);
                    };
                parties_chart.selection.all.each(function (d) {
                    var id = d[4];
                    if ( party_id != id && members_chart.parties_toggle[id] ) {
                        members_chart.hide(id, true, is_all && zoom_out);
                    }
                    if ( party_id == id ) {
                        members_chart.show(id, true);
                        members_chart.zoom(true);
                    }
                });
                // toggle view state
                parties_view = is_all;
                // toggle all parties
                parties_chart.selection.all.call(parties_chart.transition, parties_chart, !is_all);
                // toggle the transparency of the parties chart to events, to enable those on the members chart that's underneath it
                parties_chart.svg.classed('no-events', !is_all);
            });
            // IE can't set innerHTML of select, need to use the .options.add interface
            if ( typeof parties_menu[0][0].options.add == 'function' ) {
                parties_menu[0][0].options.add(function () {
                    var option = document.createElement('option');
                    option.text = 'כל המפלגות';
                    option.value = '0';
                    return option;
                }());
                //# Array.prototype.forEach
                parties.objects.forEach(function (item) {
                    var option = document.createElement('option');
                    option.text = item.name;
                    option.value = item.id;
                    parties_menu[0][0].options.add(option);
                });
                parties_menu.on('change', function (d) {
                    dispatcher.change_party(d3.event.target.value);
                });
            }
            else {
                //# Array.prototype.reduce
                parties_menu.html(parties.objects.reduce(function (html, item) {
                    return html + '<option value="' + item.id + '">' + item.name + '</option>';
                }, '<option value="0">כל המפלגות</option>'));
            }
            parties_menu.on('change', function (d) {
                dispatcher.change_party(d3.event.target.value);
            });

            toggle_zoom.on('click', function (d) {
                if ( parties_view ) {
                    parties_chart.zoom();
                    members_chart.zoom(parties_chart.zoom_in ? 'all' : false);
                }
                else {
                    members_chart.zoom();
                }
            });

            // set agenda metadata
            d3.select('#owner-image > a').append('img')
                .attr('src', BASE_URL + agenda.image).attr('height', '32')
                .attr('href', BASE_URL + agenda.absolute_url);
            d3.select('#agenda-name > a').text(agenda.name)
                .attr('href', BASE_URL + agenda.absolute_url);
            d3.select('#public-owner-name > a').text(agenda.public_owner_name)
                .attr('href', BASE_URL + agenda.absolute_url);
            d3.select('#number-of-votes').text(agenda.votes.length);
            d3.select('#loader').transition().delay(200).duration(400).style('top', '100%').style('opacity', 0);
            d3.select('#embed-snippet').property('value', EMBED_SNIPPET).on('click', function () { this.select(); });
            d3.select('#share-snippet').property('value', BASE_URL + agenda.absolute_url).on('click', function () { this.select(); });

            var embedHandler = function () {
                var h = embed_ovelay_on ? '0%' : '100%';
                if ( share_ovelay_on ) {
                    shareHandler();
                }
                embed_ovelay_on = !embed_ovelay_on;
                embed_overlay.transition().duration(300).style('height', h);
            };
            var shareHandler = function () {
                var h = share_ovelay_on ? '0%' : '100%';
                if ( embed_ovelay_on ) {
                    embedHandler();
                }
                share_ovelay_on = !share_ovelay_on;
                share_overlay.transition().duration(300).style('height', h);
            };
            d3.select('#embed-link').on('click', embedHandler);
            d3.select('#share-link').on('click', shareHandler);
        }
    );
});