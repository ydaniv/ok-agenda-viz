define(['agenda-charts', '../lib/reqwest', '../lib/when'], function (Charts, Reqwest, When) {

    var Model = {
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
                parties_data = agenda.parties.map(function (item, i) {
                    item.size = parties.objects[i].number_of_seats;
                    item.volume = 100;
                    return item;
                }),
                parties_chart = new Charts.PartiesChart({
                    data        : parties_data,
                    container   : '#parties-chart',
                    height      : 300,
                    width       : 800,
                    mouseover   : function (party) {
                        var party_name = party[3],
                            selection_parties = members_chart.selection.parties;
                        if ( ! (party_name in selection_parties) ) {
                            selection_parties[party_name] = members_chart.selection.all.filter(function (d) {
                                return d[4] === party[3]; // if member.party === party.name
                            });
                        }
                        selection_parties[party_name].call(members_chart.transition, members_chart);
                    },
                    mouseout    : function (party) {
                        members_chart.selection.parties[party[3]].call(
                            members_chart.transition,
                            members_chart,
                            true
                        );
                    },
                    no_axes     : true
                }).draw(),

                members_chart = new Charts.MembersChart({
                    data        : agenda.members
                    ,
                    container   : '#members-chart',
                    height      : 300,
                    width       : 800
                }).initDraw();
        }
    );
});