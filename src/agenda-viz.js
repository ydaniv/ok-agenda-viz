define(['agenda-charts', '../lib/reqwest', '../lib/when'], function (Charts, Reqwest, When) {

    var d3 = window.d3,
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
                            console.log(response);
                            that.cache(url, response);
                            deferred.resolve(response);
                        },
                        error   : function () {
                            try {
                                console.error('Failed to get ' + url, arguments);
                            } catch (e) {alert('Failed to get ' + url);}
                            deferred.reject(arguments[1]);
                        }
                    });
                }
                return deferred.promise;
            },
            cache   : function (key, data) {
                if ( arguments.length === 1 ) {
                    return JSON.parse(localStorage.getItem(key));
                }
                else {
                    localStorage.setItem(key, JSON.stringify(data));
                }
            }
        },
        Parties = Object.create(Model),
        Agenda = Object.create(Model);

    When.all(
        [Parties.get('http://oknesset.org/api/v2/party/?callback=?'),
        Agenda.get('http://oknesset.org/api/v2/agenda/' + 26 + '/?callback=?')],
        function (responses) {
            var parties = responses[0],
                agenda = responses[1],
                parties_menu = d3.select('#parties-menu'),
                toggle_zoom = d3.select('#toggle-zoom'),
                parties_data = agenda.parties.map(function (item, i) {
                    item.size = parties.objects[i].number_of_seats;
                    item.volume = 100;
                    item.id = parties.objects[i].id;
                    return item;
                }),
                members_data = (agenda.parties.forEach(function (party) {
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
                    height      : 300,
                    width       : 800,
                    mouseover   : function (party) {
                        members_chart.show(party[4]);
                    },
                    mouseout    : function (party) {
                        members_chart.hide(party[4]);
                    },
                    touchstart  : function (party) {
                        var party_id = party[4];
                        if ( members_chart.parties_toggle[party_id] ) {
                            // doesn't seem to trigger 'change' event, at least not on chrome
                            parties_menu.property('value', party_id);
                            dispatcher.change_party(party_id);
                        }
                        else {
                            members_chart.toggle(party_id, true);
                        }
                    },
                    no_axes     : true
                }).draw(),

                members_chart = new Charts.MembersChart({
                    data        : members_data,
                    container   : '#members-chart',
                    height      : 300,
                    width       : 800
                }).render(),
                parties_view = true;

            // after parties chart was initialised with default X scale domain,
            // set it's X domain to the min/max of members' scores
            parties_chart.domains =[
                d3.min(members_data, function (d) {return d.score;}),
                d3.max(members_data, function (d) {return d.score;})
            ];

            dispatcher.on('change_party', function (party_id) {
                var is_all = !+party_id;
                parties_chart.selection.all.each(function (d) {
                    var id = d[4];
                    if ( party_id != id && members_chart.parties_toggle[id] ) {
                        members_chart.hide(id, true);
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
                if ( is_all ) {
                    members_chart.zoom(parties_chart.zoom_in ? 'all' : false);
                }
            });

            parties_menu.html(parties.objects.reduce(function (html, item) {
                    return html + '<option value="' + item.id + '">' + item.name + '</option>';
                }, '<option value="0">כל המפלגות</option>'))
                .on('change', function (d) {
                    //TODO: publish an event that transitions current display out and selected display in
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
        }
    );
});