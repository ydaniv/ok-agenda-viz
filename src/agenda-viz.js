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
        initial_member = (function () {
            var hash = window.location.hash;
            return hash ? +hash.slice(1) : null;
        }()),
        // `document.body` in IE8
        window_height = document.body ? document.body.clientHeight : window.innerHeight,
        window_width = document.body ? document.body.clientWidth : window.innerWidth,
        EMBED_SNIPPET = '<iframe width="600" height="400" src="' + window.location.href + '"></iframe>',
        Model = {
            get : function (url, refresh) {
                var deferred = When.defer(),
                    that = this,
                    cache = this.cache(url);
                if ( cache ) {
                    if ( refresh ) {
                        this.cache(url, null); // clear this from cache
                    } else {
                        deferred.resolve(cache);
                        return deferred.promise;
                    }
                }
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
                return deferred.promise;
            },
            cache   : function (key, data) {
                try {
                    if ( arguments.length === 1 ) {
                        return JSON.parse(localStorage.getItem(key));
                    }
                    else {
                        if ( data === null ) {
                            localStorage.removeItem(key);
                        } else {
                            localStorage.setItem(key, JSON.stringify(data));
                        }
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
        Agenda.get('http://oknesset.org/api/v2/agenda/' + agenda_id + '/?callback=?', true),
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
                        if ( ! parties_touches ) {
                            enterPartyHandler(party[4], this);
                        }
                    },
                    touchstart  : function (party) {
                        // just detect that a touch event was triggered to prevent the click handler
                        var parties_touches = d3.touches(parties_chart.svg.node().parentNode).length,
                            party_id = party[4];
                        if ( members_chart.parties_toggle[party_id] ) {
                            enterPartyHandler(party_id, this);
                        }
                        else {
                            parties_chart.selection.all.attr('fill-opacity', function (d) {
                                return d[4] != party_id ? 0 : .4;
                            });
                            members_chart.single(party_id, true);
                        }
                    },
                    no_axes     : true
                }),
                enterPartyHandler = function (party_id, el) {
                    parties_chart.toggleEvents(false);
                    d3.select(el).attr('fill-opacity', 0);
                    // doesn't seem to trigger 'change' event, at least not on chrome
                    parties_menu.property('value', party_id);
                    dispatcher.change_party(party_id);
                },
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
                    click       : function (member) {
                        if ( ! members_touches ) {
                            selectMemberHandler(member, this);
                        }
                    },
                    touchstart  : function (member) {
                        // just detect that a touch event was triggered to prevent the click handler
                        members_touches = d3.touches(members_chart.svg.node().parentNode).length;
                        selectMemberHandler(member, this);
                    }
                }),
                selectMemberHandler = function (member, el) {
                    var member_id = member[8];
                    if ( ! el ) {
                        members_chart.selection.all.each(function (d) {
                            if ( d[8] === member_id ) el = this;
                        });
                    }
                    // if this is a second selection on the focuesd member
                    if ( members_chart.focused_member === member_id ) {
                        // open the link to the member
                        openMemberHandler(member);
                    }
                    // if this is a new selection
                    else {
                        // if there's a previous focused member
                        if ( members_chart.focused_member ) {
                            // hide its tooltip
                            members_chart.hideDetails(member);
                        }
                        // set the hash to this member's id
                        window.location.hash = '#' + member_id;
                        // set the current focused member
                        members_chart.focused_member = member[8];
                        // show this member's tooltip
                        members_chart.showDetails(member, d3.select(el));
                    }
                },
                clearMemberSelection = function () {
                    window.location.hash = '';
                    members_chart.focused_member = 0;
                    members_chart.hideDetails();
                },
                parties_view = ! initial_member;

            dispatcher.on('change_party', function (party_id) {
                var is_all = !+party_id,
                    zoom_out = function () {
                        members_chart.zoom(parties_chart.zoom_in ? 'all' : false, true);
                    };
                clearMemberSelection();
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
                parties_chart.toggleEvents(is_all);
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

            // initialize charts
            // check if there's an initial state of a selected member
            var member = agenda.members.filter(function (item) {
                return item.id === initial_member;
            })[0];

            if ( initial_member && member ) {
                parties_chart.render();
                members_chart.render();
                parties_menu.property('value', member.party_id);
                //# Array.prototype.filter
                members_chart.show(member.party_id, true, function () {
                    selectMemberHandler(members_chart.selection.all.filter(function (d) {
                        return d[8] === initial_member;
                    }).data()[0]);
                });
                members_chart.zoom(true, true);
                parties_chart.svg.toggleEvents(false);
            } else {
                parties_chart.draw();
                members_chart.render();
            }
            // after parties chart was initialised with default X scale domain,
            // set it's X domain to the min/max of members' scores
            parties_chart.domains =[
                d3.min(members_data, function (d) {return d.score;}),
                d3.max(members_data, function (d) {return d.score;})
            ];
        }
    );
});