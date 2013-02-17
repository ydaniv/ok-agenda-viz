requirejs(['agenda-charts', 'reqwest', 'when'], function (Charts, Reqwest, When) {

    // polyfill for `Object.create` if needed
    if (!Object.create) {
        Object.create = function (proto, props) {
            function F () {}
            F.prototype = proto;
            return new F();
        }
    }
    // cache d3 namespace to this scope
    var d3 = window.d3,
        // some globals
        BASE_URL = 'http://oknesset.org',
        IMAGES_PATH = window.IMAGES_PATH || '/src/img/icons/',
        // get the id of the agenda to show from the URL's query params or default to 2
        agenda_id = (function () {
            var match = window.location.search.match(/agenda_id=(\d+)/i);
            return (match && match[1]) || 2;
        }()),
        // check whether we need to hijack click on members and do postMessage instead of opening their view on Open-Knesset site
        OVERRIDE_MEMBERS_CLICK = !!window.location.search.match(/memberjack=1/i),
        // the host of the parent to call postMessage to
        HOSTNAME = (function () {
            var match = window.location.search.match(/hostname=([^&]*)/i),
                res = (match && match[1]) || null;
            return res ? decodeURIComponent(res) : res;
        }()),
        initial_party = null,
        // check URL's hash for an initial state of focusing a member or a party
        initial_member = (function () {
            var hash = window.location.hash;
            if ( /member_\d+/.test(hash) ) {
                return +hash.split('_')[1];
            }
            else if ( /party_\d+/.test(hash) ) {
                initial_party = +hash.split('_')[1];
            }
            return null;
        }()),
        // for use in the embed overlay
        embed_snippet = '<iframe width="600" height="400" src="' + window.location.href + '"></iframe>',
        /**
         * Abstract Model class for all charts' data.
         *
         * @name Model
         */
        Model = {
            /**
             * Gets data via a JSONP call.
             *
             * @memberof {Model}
             * @param url {String} URL to use for the JSONP call
             * @param [refresh] {Boolean} whether to force a refresh of cache
             * @return {Promise}
             */
            get : function (url, refresh) {
                var deferred = When.defer(),
                    that = this,
                    // get from cache
                    cache = this.cache(url);
                // if we have cache
                if ( cache ) {
                    if ( refresh ) {
                        // clear this from cache
                        this.cache(url, null);
                    } else {
                        // use cache
                        deferred.resolve(cache);
                        return deferred.promise;
                    }
                }
                //TODO: consider using d3.xhr
                // make the request
                Reqwest({
                    url     : url,
                    type    : 'jsonp',
                    success : function (response) {
                        window.console && console.log(response);
                        // cache results
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
            /**
             * Gets or sets data to localStorage via JSON API.
             * It's all wrapped in a `try catch` clause so just won't happen on non-standard browsers. Tough luck!
             * If `data` is not supplied it will get the value of `key`.
             * If `data` is `null` it will delete it.
             * If `data` is supplied and not `null` it will attempt to store it under `key`.
             *
             * @memberof {Model}
             * @param key {String} URL to use for the JSONP call
             * @param [data] {*|null} JSON serializable data or `null` to delete
             * @return {Promise}
             */
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
                } catch (e) {
                    // don't care
                }
            }
        },
        // instantiate models
        Parties = Object.create(Model),
        Agenda = Object.create(Model),
        Members = Object.create(Model),
        // cache some DOM references
        embed_overlay = d3.select('#embed-overlay'),
        share_overlay = d3.select('#share-overlay'),
        help_overlay = d3.select('#help-overlay'),
        // overlays states
        embed_overlay_on = false,
        share_overlay_on = false,
        about_overlay_on = false,
        help_overlay_on = false,
        // `document.body` in IE8
        window_height = document.body ? document.body.clientHeight : window.innerHeight,
        window_width = document.body ? document.body.clientWidth : window.innerWidth;

    // JS files are loaded, change loader state to "loading data..."
    d3.select('#loader-message').text('טוען נתונים...');
    // when.js also wraps the resolved and rejected calls in `try-catch` statements
    When.all(
        [Parties.get('http://api.oknesset.org/api/v2/party/?callback=?'),
            Agenda.get('http://api.oknesset.org/api/v2/agenda/' + agenda_id + '/?callback=?', true),
            Members.get('http://api.oknesset.org/api/v2/member/?callback=?')],
        // do magic!
        function (responses) {
            // get all the data we need
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
                // widget's events dispatcher
                dispatcher = d3.dispatch('change_party', 'change_hash'),
                // flag for recognizing touch events so that if we get a false positive on touch support it won't fire handlers twice
                parties_touches = 0,
                // init PartiesChart
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
                            members_chart.single(party_id);
                        }
                    },
                    no_axes     : true
                }),
                // wrap some handlers for re-use
                /**
                 *  Handles zooming into a party.
                 *  Toggles view state to members view, hides parties and shows members of that party
                 */
                enterPartyHandler = function (party_id, el) {
                    dispatcher.change_hash(party_id);
                    parties_chart.toggleEvents(false);
                    d3.select(el).attr('fill-opacity', 0);
                    // doesn't seem to trigger 'change' event, at least not on chrome
                    parties_menu.property('value', party_id);
                    dispatcher.change_party(party_id);
                },
                /**
                 *  Handles opening a member's agenda page on Open-Knesset site or postMessage if required.
                 */
                openMemberHandler = function (member) {
                    if ( OVERRIDE_MEMBERS_CLICK && HOSTNAME ) {
                        parent.postMessage(member[8], HOSTNAME);
                    } else {
                        window.open(BASE_URL + agenda.absolute_url + 'member/' + member[8] + '/');
                    }
                },
                members_touches = 0,
                // init MembersChart
                members_chart = new Charts.MembersChart({
                    data        : members_data,
                    container   : '#charts',
                    id          : 'members-canvas',
                    mouseover   : function (member) {
                        var _self = this,
                            min_x = (member[0] | 0) - 1,
                            max_x = (member[0] | 0) + 1;
                        members_chart.selection.current.each(function (d) {
                            if ( _self !== this && d[0] < max_x && d[0] > min_x ) {
                                d3.select(this).select('line').attr('stroke-width', 0);
                            }
                        });
                    },
                    mouseout    : function (member) {
                        members_chart.selection.current.each(function (d) {
                            d3.select(this)
                                .select('line').attr('stroke-width', members_chart.bar_width);
                        });
                    },
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
                // wrapping handlers for re-use
                /**
                 *  Handles a selection of a member to be focused.
                 *  Opens its persistent tooltip and so on.
                 */
                selectMemberHandler = function (member, el) {
                    var member_id = member[8], _member, last_member;
                    if ( ! el ) {
                        el = members_chart.selection.getMember(member_id).node();
                    }
                    _member = d3.select(el);
                    // if this is a second selection on the focuesd member
                    if ( members_chart.focused_member === member_id ) {
                        // open the link to the member
                        openMemberHandler(member);
                    }
                    // if this is a new selection
                    else {
                        // if there's a previous focused member
                        if ( members_chart.focused_member ) {
                            // hide tooltips
                            members_chart.hideDetails(member, true);
                            last_member = members_chart.selection.getMember(members_chart.focused_member);
                            last_member.select('image').remove();
                            last_member.select('circle').attr('r', members_chart.bar_width / 2);
                        }
                        // set the hash to this member's id
                        dispatcher.change_hash(member_id, true);
                        // set the current focused member
                        members_chart.focused_member = member[8];
                        // show this member's tooltip
                        members_chart.showDetails(member, d3.select(el), true);
                        // change its circle to the link icon
                        _member.append('image')
                            .attr('x', -2)
                            .attr('y', _member.select('circle').attr('r', 0).attr('cy') - 8)
                            .attr('width', 14)
                            .attr('height', 14)
                            .attr('xlink:href', IMAGES_PATH + 'i_link.png');
                    }
                },
                /**
                 *  Clears selection of focused member.
                 */
                clearMemberSelection = function () {
                    var last_member = members_chart.selection.getMember(members_chart.focused_member);
                    if ( /member_\d+/.test(window.location.hash) ) {
                        dispatcher.change_hash('');
                    }
                    last_member.select('image').remove();
                    last_member.select('circle').attr('r', members_chart.bar_width / 2);
                    members_chart.focused_member = 0;
                    // hide both tooltips
                    members_chart.hideDetails(last_member.data(), true);
                },
                // set view state
                parties_view = ! initial_member,
                // get top 5 important votes for viewing in the "about" section
                votes = agenda.votes.slice(0)
                        .sort(function (a, b) {
                            return a.importance === b.importance ? 0 :
                                    a.importance < b.importance ? -1 : 1;
                        }).slice(0, 5);

            // add a `change_party` handler
            dispatcher.on('change_party', function (party_id) {
                var is_all = !+party_id,
                    zoom_out = function () {
                        members_chart.zoom(parties_chart.zoom_in ? 'all' : false, true);
                    };
                // toggle view state
                parties_view = is_all;
                // clear focused member
                clearMemberSelection();
                
                // loop over all parties
                parties_chart.selection.all.each(function (d) {
                    var id = d[4];
                    // if party is toggled on and different from selected party
                    if ( party_id != id && members_chart.parties_toggle[id] ) {
                        // hide its members
                        members_chart.hide(id, true, is_all && zoom_out);
                    }
                    // if it's the selected party
                    if ( party_id == id ) {
                        // show it and zoom in
                        members_chart.show(id, true).zoom(true);
                        button_chart.show(id, true).zoom(false);
                    }
                    else {
                        if ( ! is_all ) {
                            button_chart.hide(id, true);
                        }
                    }
                });
                // re-render members according to view state
//                (is_all ? members_chart.background : members_chart.foreground).call(members_chart);
                if ( is_all ) {
                    button_chart.select().call(button_chart.transition, button_chart);
                    button_chart.zoom( ! parties_chart.zoom_in ? 'all' : false);
                }
                // toggle all parties
                parties_chart.selection.all.call(parties_chart.transition, parties_chart, !is_all);
                // toggle the transparency of the parties chart to events, to enable those on the members chart that's underneath it
                parties_chart.toggleEvents(is_all);

                // toggle the 'back-to-parties' ribbon
                toggleExitButtonHandler(!is_all);
                // clear party selection if needed
                dispatcher.change_hash(is_all ? '' : party_id, false);
            });
            // add a `change_hash` handler
            dispatcher.on('change_hash', function (hash, is_member) {
                // match the `src` attribute with its value in the snippet
                var match = embed_snippet.match(/src="[^#]+(#?.*)"/),
                    id = is_member && hash,
                    share_url;
                // generate new hash
                hash = hash ?
                    is_member ?
                        '#member_' + hash :
                        '#party_' + hash :
                    '';
                // generate a new sharing URL
                share_url = BASE_URL + agenda.absolute_url + (hash && is_member ? 'member/' + id + '/' : '');
                // set window hash
                window.location.hash = hash;
                // if there's a concrete match
                if ( match && match[1] ) {
                    // update the embed HTML snippet
                    embed_snippet = !!match[1] ?
                                        embed_snippet.replace(match[1], hash) :
                                        embed_snippet.replace(match[0], match[0] + hash);
                }
                else {
                    // otherwise, there was no initial hash in the `src`, just add the new one
                    embed_snippet = embed_snippet.replace(/src="([^"]*)"/, 'src="$1' + hash + '"')
                }
                // change `value` properties of embed and share text inputs
                d3.select('#embed-snippet').property('value', embed_snippet);
                d3.select('#share-snippet').property('value', share_url);
                
            });
            // fill the parties `select` with `option`s of parties
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
            // add a listener to the `change` event
            parties_menu.on('change', function (d) {
                // trigger `change_party` handler
                dispatcher.change_party(d3.event.target.value);
            });

            // add a listener to `click` event on the zoom button
            toggle_zoom.on('click', function (d) {
                // according to view state
                if ( parties_view ) {
                    parties_chart.zoom();
                    members_chart.zoom(parties_chart.zoom_in ? 'all' : false);
                    button_chart.zoom( ! parties_chart.zoom_in ? 'all' : false);
                }
                else {
                    members_chart.zoom();
                    button_chart.zoom();
                }
            });

            // set agenda metadata
            // agenda owner image
            if ( agenda.image ) {
                d3.select('#owner-image > a').append('img')
                    .attr('src', BASE_URL + agenda.image).attr('height', '32')
                    .attr('href', BASE_URL + agenda.absolute_url);
            }
            else {
                d3.select('#owner-image').style('display', 'none');
            }
            // agenda name
            d3.select('#agenda-name > a').text(agenda.name)
                .attr('href', BASE_URL + agenda.absolute_url);
            // agenda owner name
            d3.select('#public-owner-name > a').text(agenda.public_owner_name)
                .attr('href', BASE_URL + agenda.absolute_url);
            // number of votes
            d3.select('#number-of-votes').text(agenda.votes.length);

            // remove that loader please
            d3.select('#loader').transition().delay(200).duration(400).style('top', '100%').style('opacity', 0);

            // handle share and embed inputs
            d3.select('#embed-snippet').property('value', embed_snippet).on('click', function () {
                d3.event.stopPropagation();
                this.select();
            });
            d3.select('#share-snippet').property('value', BASE_URL + agenda.absolute_url).on('click', function () {
                d3.event.stopPropagation();
                this.select();
            });
            // init the twitter button
            d3.select('#tweeter').attr('data-text', agenda.name + ' בעריכת ' + agenda.public_owner_name);

            // add handlers for click on exit button
            d3.select('#exit-button').on('click', function () {
                if ( share_overlay_on ) {
                    shareHandler();
                }
                else if ( help_overlay_on ) {
                    helpHandler();
                }
                else if ( embed_overlay_on ) {
                    embedHandler();
                }
                else {
                    return dispatcher.change_party(0);
                }
                toggleExitButtonHandler();
            });

            var toggleExitButtonHandler = function (toggle) {
                // if it's toggled off and we're still members view state
                if ( ! toggle && ! parties_view ) return;

                d3.select('#exit-button')
                    .transition().duration(300)
                        .style('height', toggle ? '60px' : '0px')
            };
            // creates a *dynamic* tweet button according to viewed agenda and party/member selection
            var tweeterHandler = function () {
                // create a new dynamic tweeter
                var share_url = d3.select('#share-snippet').property('value'),
                    tweeter = d3.select('#tweeter').node().cloneNode(),
                    script_id = 'twitter-widgets',
                    current_script = document.getElementById(script_id),
                    script;
                d3.select(tweeter)
                    .attr('id', 'tweeter-clone')
                    .attr('data-url', share_url)
                    .classed('twitter-share-button', true)
                    .classed('hide', false);
                // remove old tweeters
                share_overlay.selectAll('.twitter-share-button').remove();
                // append the new one
                share_overlay.select('.overlay-message').node().appendChild(tweeter);
                // re-get the twitter widgets script
                script = document.createElement('script');
                current_script && document.head.removeChild(current_script);
                // reload the twitter/widgets script to get it re-initialize the button
                // it will just fetch it from cache but the result is the same
                script.src = 'http://platform.twitter.com/widgets.js';
                script.id = script_id;
                script.async = true;
//                script.setAttribute('data-time', Date.now());
                document.head.appendChild(script);
            };
            // bunch of handlers to handle overlays states and toggling them
            var embedHandler = function () {
                var h = embed_overlay_on ? '0%' : '100%';
                if ( share_overlay_on ) {
                    shareHandler();
                }
                else if ( help_overlay_on ) {
                    helpHandler();
                }
                embed_overlay_on = ! embed_overlay_on;
                embed_overlay.transition().duration(300).style('height', h);
                toggleExitButtonHandler(true);
            };
            var shareHandler = function () {
                var h = share_overlay_on ? '0%' : '100%';
                share_overlay_on || tweeterHandler();
                if ( embed_overlay_on ) {
                    embedHandler();
                } 
                else if ( help_overlay_on ) {
                    helpHandler();
                }
                share_overlay_on = ! share_overlay_on;
                share_overlay.transition().duration(300).style('height', h);
                toggleExitButtonHandler(true);
            };
            var helpHandler = function () {
                var h = help_overlay_on ? '0%' : '100%';
                if ( embed_overlay_on ) {
                    embedHandler();
                }
                else if ( share_overlay_on ) {
                    shareHandler();
                }
                help_overlay_on = ! help_overlay_on;
                help_overlay.transition().duration(300).style('height', h);
                toggleExitButtonHandler(true);
            };
            var aboutToggleHandler = (function () {
                var overlay = d3.select('#about-overlay'),
                    toggler = d3.select('#about-toggler'),
                    exit_button = d3.select('#exit-about'),
                    hide_bottom = window_height - 43 + 'px',
                    handler = function () {
                        var bottom = about_overlay_on ? hide_bottom : '21px';
                        about_overlay_on = ! about_overlay_on;
                        exit_button.transition().duration(about_overlay_on ? 300 : 50).style('height', about_overlay_on ? '60px' : 0);
                        overlay.transition().duration(300).style('bottom', bottom);
                        toggler.classed('opened', about_overlay_on);
                    };
                exit_button.on('click', handler);
                overlay.style('bottom', hide_bottom).classed('hide', false);
                return handler;
            }());
            // handle clicks on embed/share links and their overlays
            d3.select('#embed-link').on('click', embedHandler);
            d3.select('#share-link').on('click', shareHandler);
            d3.select('#info-agenda').on('click', helpHandler);
            share_overlay.on('click', shareHandler);
            embed_overlay.on('click', embedHandler);
            help_overlay.on('click', helpHandler);

            // init the About overlay
            d3.select('#about-content').text(agenda.description);
            d3.select('#about-votes').selectAll('li')
                                    .data(votes).enter().append('li')
                                    .append('a')
                                        .attr('target', '_blank')
                                        .attr('href', function (d) {
                                            return BASE_URL + '/vote/' + d.id + '/';
                                        })
                                        .text(function (d) {
                                            return d.title;
                                        });
            d3.select('#about-toggler').on('click', aboutToggleHandler);
            d3.select('#about-overlay').on('click', aboutToggleHandler);

            // initialize charts
            // check if there's an initial state of a selected member
            if ( initial_member ) {
                var member = agenda.members.filter(function (item) {
                    return item.id === initial_member;
                })[0];
            }

            // draw the button chart
            var button_chart = new Charts.ButtonChart({
                data        : members_data,
                container   : '#toggle-zoom',
                id          : 'zoom-button-canvas',
                width       : 80,
                height      : 22,
                padding     : {
                    x   : 10,
                    y   : 5
                }
            }).render();

            // handle initial state
            if ( member ) {
                // this is a focused member state
                parties_view = false;
                // render parties and members
                parties_chart.render();
                members_chart.render();
                // select the member's party
                parties_menu.property('value', member.party_id);
                // select the member's party and show it
                //# Array.prototype.filter
                members_chart.show(member.party_id, true, function () {
                    selectMemberHandler(members_chart.selection.getMember(initial_member).data()[0]);
                });
                // zoom in to members chart
                members_chart.zoom(true, true);
                // disable events on parties chart
                parties_chart.toggleEvents(false);
                // set zoom button state
                button_chart.select().call(button_chart.transition, button_chart, true);
                button_chart.show(member.party_id, true).zoom(false);
            } else if ( initial_party ) {
                // this is a party state, meaning a members view of an entire party
                parties_view = false;
                // render charts
                parties_chart.render();
                members_chart.render();
                // select the party
                parties_menu.property('value', initial_party);
                // show its members
                members_chart.show(initial_party, true);
                // disable events on parties chart
                parties_chart.toggleEvents(false);
                // set zoom button state
                button_chart.select().call(button_chart.transition, button_chart, true);
                button_chart.show(initial_party, true).zoom(true);
            } else {
                // no initial state
                // this is parties view state
                parties_view = true;
                // completely draw parties chart
                parties_chart.draw();
                // render members
                members_chart.render();
                // zoom in in button chart
                button_chart.zoom('all');
            }

            // init tweeter
            tweeterHandler();
            if ( member || initial_party ) {
                toggleExitButtonHandler(true);
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
