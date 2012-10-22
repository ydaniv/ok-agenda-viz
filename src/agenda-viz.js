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
        Agenda.get('http://oknesset.org/api/v2/agenda/' + 1 + '/?callback=?')],
        function (responses) {
            var parties = responses[0],
                agenda = responses[1],
                parties_menu = d3.select('#parties-menu'),
                toggle_zoom = d3.select('#toggle-zoom'),
                toggle_view = d3.select('#toggle-view'),
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
                dispatcher = d3.dispatch('change_party', 'switch_controls'),
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
                    click       : function (party) {
                        members_chart.toggle(party[4], true);
                    },
                    no_axes     : true
                }).draw(),

                members_chart = new Charts.MembersChart({
                    data        : members_data,
                    container   : '#members-chart',
                    height      : 300,
                    width       : 800
                }).render();
            
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
                // toggle all parties
                parties_chart.selection.all.call(parties_chart.transition, parties_chart, !is_all);
                if ( is_all ) {
                    members_chart.zoom(false);
                }
                // turn on/off zoom toggle and view toggle
                dispatcher.switch_controls(is_all);
            })
            .on('switch_controls', function (is_parties_view) {
                toggle_zoom.attr('class', is_parties_view ? 'hide' : '');
                toggle_view.attr('class', ! is_parties_view ? 'hide' : '');
            });

            parties_menu.html(parties.objects.reduce(function (html, item) {
                    return html + '<option value="' + item.id + '">' + item.name + '</option>';
                }, '<option value="0">כל המפלגות</option>'))
                .on('change', function (d) {
                    //TODO: publish an event that transitions current display out and selected display in
                    dispatcher.change_party(d3.event.target.value);
                });

            toggle_zoom.on('click', function (d) {
                members_chart.zoom();
            });
            toggle_view.on('click', function () {
                
            });
        }
    );
});