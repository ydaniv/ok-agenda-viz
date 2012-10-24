define(['agenda-charts', 'lib/reqwest', 'lib/when'], function (Charts, Reqwest, When) {

    var d3 = window.d3,
        BASE_URL = 'http://oknesset.org',
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
    // `document.body` in IE8
        window_height = document.body ? document.body.clientHeight : window.innerHeight,
        window_width = document.body ? document.body.clientWidth : window.innerWidth;

    When.all(
        [Parties.get('http://oknesset.org/api/v2/party/?callback=?'),
            Agenda.get('http://oknesset.org/api/v2/agenda/' + 26 + '/?callback=?')],
        function (responses) {
            var parties = responses[0],
                agenda = responses[1],
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
                    agenda.members.forEach(function (member) {
                        if ( party.name === member.party ) {
                            member.party_id = party.id;
                        }
                    });
                }), agenda.members),
                dispatcher = d3.dispatch('change_party'),
                parties_chart = new Charts.PartiesChart({
                    data        : parties_data,
                    container   : '#parties-chart',
                    mouseover   : function (party) {
                        var party_id = party[4];
                        members_chart.show(party_id);
                        parties_chart.selection.all.attr('fill-opacity', function (d) {
                            return d[4] != party_id ? 0 : .9;
                        });
                    },
                    mouseout    : function (party) {
                        members_chart.hide(party[4]);
                        parties_chart.selection.all.attr('fill-opacity', 0);
                    },
                    touchstart  : function (party) {
                        var party_id = party[4];
                        if ( members_chart.parties_toggle[party_id] ) {
                            // doesn't seem to trigger 'change' event, at least not on chrome
                            parties_menu.property('value', party_id);
                            dispatcher.change_party(party_id);
                        }
                        else {
                            parties_chart.selection.all.attr('fill-opacity', function (d) {
                                return d[4] != party_id ? 0 : .9;
                            });
                            members_chart.single(party_id, true);
                        }
                    },
                    no_axes     : true
                }).draw(),

                members_chart = new Charts.MembersChart({
                    data        : members_data,
                    container   : '#members-chart'
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
            });
            //# Array.prototype.reduce
            parties_menu.html(parties.objects.reduce(function (html, item) {
                return html + '<option value="' + item.id + '">' + item.name + '</option>';
            }, '<option value="0">כל המפלגות</option>'))
                .on('change', function (d) {
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
                .attr('src', BASE_URL + agenda.image).attr('height', '38')
                .attr('href', BASE_URL + agenda.absolute_url);
            d3.select('#agenda-name > a').text(agenda.name)
                .attr('href', BASE_URL + agenda.absolute_url);
            d3.select('#public-owner-name > a').text(agenda.public_owner_name)
                .attr('href', BASE_URL + agenda.absolute_url);
            d3.select('#number-of-votes').text(agenda.votes.length);
        }
    );
});