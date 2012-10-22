define(['agenda-charts', '../lib/reqwest', '../lib/when'], function (Charts, Reqwest, When) {

    var d3 = window.d3,
        Model = {
            get : function (url) {
                var deferred = When.defer();
                //TODO: consider using d3.xhr
                Reqwest({
                    url     : url,
                    type    : 'jsonp',
                    success : function (response) {
                        console.log(response);
                        this.data = response;
                        deferred.resolve(response);
                    },
                    error   : function () {
                        try {
                            console.error('Failed to get ' + url, arguments);
                        } catch (e) {alert('Failed to get ' + url);}
                        deferred.reject(arguments[1]);
                    }
                });
                return deferred.promise;
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
                parties_menu = document.getElementById('parties-menu'),
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
                parties_chart.selection.all.each(function (d) {
                    var id = d[4];
                    if ( party_id != id && members_chart.parties_toggle[id] ) {
                        members_chart.hide(id, true);
                    }
                    if ( party_id == id ) {
                        members_chart.show(id, true);
                    }
                });
                // toggle all parties
                parties_chart.selection.all.call(parties_chart.transition, parties_chart, +party_id);
            });

            parties_menu.innerHTML = parties.objects.reduce(function (html, item) {
                return html + '<option value="' + item.id + '">' + item.name + '</option>';
            }, '<option value="0">כל המפלגות</option>');
            parties_menu.addEventListener('change', function (e) {
                //TODO: publish an event that transitions current display out and selected display in
                dispatcher.change_party(e.target.value);
            }, false);
        }
    );
});