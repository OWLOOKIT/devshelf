var TARGET_CONT = 'main-content',
    totalTagList = {},
    searchTagList = [],
    voteData = {};

var isTouch = (('ontouchstart' in window) || (navigator.msMaxTouchPoints > 0));
var devMode = getCookie('app-mode') === 'development' ? true : false;

var templateEngine = (function() {
    var hashStruct = {};

    return {

        /**
         * Filter results from all-data.json related to inserted word or this part;
         * @param {Object} opt Options for search
         * 0: {String} opt.qSearch query string
         * 1: {JSON} opt.allData JSON with articles
         * @returns {Array}
         * 0: {Object} full results with categories; need to upgrade mustache render func;
         * 1: {Array} lite version; can be used in mustache without workarounds;
         */
        fuzzySearch: function fuzzy (opt) {
            var
                query = opt.q.toLowerCase(),
                qRegExp = new RegExp(query),
                allData = opt.allData,
                liteResult = [];

            var j = allData.length;
            while (j--) {

                var prop = allData[j],
                    tags = prop.tags,
                    tags_l = tags.length;

                if (!tags_l) continue;

                var i = tags_l;
                while (i--) {
                    if ( qRegExp.test(tags[i]) ) {
                        liteResult.push(prop);
                        break;
                    }
                    else continue;
                }
            }

            return liteResult;
        },

        /**
         * Method extends tags section
         * @returns {Object} templateEngine
         */
        extendingTags: function() {
            for (k in searchTagList) {
                var
                    prop = searchTagList[k],
                    prop_l = prop.length;

                if (!prop_l) continue;

                for (var i=0; i < prop_l; i++) {
                    if (prop[i].tags === undefined) {
                        prop[i].tags = [];
                    }

                    for (var parentTags in totalTagList) {
                        if (!!totalTagList[parentTags][k]) {
                            prop[i].tags.unshift(parentTags);
                        }
                    }
                }
            }
            return this;
        },

        /**
         * Method build routing tree using data-urls attributes in exists templates
         * @param {Object} p
         * @param {Function} p.callback
         * @returns {Object} templateEngine
         */
        buildHashStruct: function(p) {
            var callback = p.callback || function() {};

            $('script[type="text/x-jquery-tmpl"][data-url]').each(function() {
                var dataUrl = $(this).attr('data-url');

                if (dataUrl !== '') {
                    hashStruct[dataUrl] = $(this).attr('id');
                }
            })

            callback();

            return this;
        },

        /**
         * Check url and define params for proper template rendering
         * @returns {Object} templateEngine
         */
        checkHash: function() {
            var currentWindowHash = window.location.hash.split('#!/');

            if (currentWindowHash[1]) this.query = currentWindowHash[1].split('/')[1];

            if ( (currentWindowHash.length > 1) && (currentWindowHash[1] !== 'home') ) {

				templateEngine.showSecondaryPage();

				currentWindowHash = currentWindowHash[1];
				templateEngine.buildHashStruct({
					callback: function() {

						/**
						 * Rendering routine call just after routing tree creation
						 */
						templateEngine.getTemplateByHash({
							hash: currentWindowHash,
							callback: function(p) {
								templateEngine.insertTemplate(p);
							}
						})
					}
				})

            } else {
                /**
                 * There's no any params
                 */

				templateEngine.showMainPage();
            }

            return this;
        },

        /**
         * Check url and define params for proper template rendering
         * @param {Object} p
         * @param {String} p.hash
         * @param {Function} p.callback
         * @returns {Object} templateEngine
         */
        getTemplateByHash: function(p) {
            var targetCont = 'main-page',
                hash = p.hash,
                callback = p.callback || function(p) {},
                getParams = p.hash.split('/')[1],
                resultList = [],
                target;

            if (!!getParams) {
                hash = p.hash.split('/')[0];
            } else {
                getParams = '';
            }

            if (hash !== '') {
            	if (!!hashStruct[hash]) {
                	targetCont = hashStruct[hash];
                } else {
                	var hashToSpaces = hash.replace(/\s+/g, '_');
                	if ( (hash.indexOf('_') !== -1) && (!!hashStruct[hashToSpaces]) ) {
               			targetCont = hashStruct[hashToSpaces];
                	}
                }
            }

            /**
             * Case of search is more complicated than others
             */
            if ((targetCont == 'search') && (!!getParams)) {
            	// Create a local copy of resultList
                $.extend(true, resultList, templateEngine.fuzzySearch({
                    q: getParams.replace(/_/g, ' '),
                    allData: searchTagList
                }));

                for (var resultInstance = 0; resultInstance < resultList.length; resultInstance++) {
                	var resultItem = resultList[resultInstance];

					for (var resultTags = 0; resultTags < resultItem.tags.length; resultTags++) {
						var title = resultItem.tags[resultTags],
							link = title.replace(/\s+/g, '_');

						resultItem.tags[resultTags] = {
							tagTitle: title,
							tagLink:link
						}
					}
                }

                if (resultList.length) {
                    templateEngine.attachVotes(resultList);
                }

                templateEngine.insertTemplate( {
                    template: 'search',
                    params: {
                        getParams: getParams.replace(/_/g, ' '),
                        resultList: resultList
                    }
                });

                /**
                 * Render search categories template
                 */
                templateEngine.getCategoryByArticle({
                    query: getParams.replace(/_/g, ' '),
                    callback: function(p) {
                        templateEngine.insertTemplate(p);
                    },
                    result: resultList
                });

                /**
                 * Prepare data for result of search list rendering
                 */
                targetCont = 'search-output';
                target = 'posts-output';

            }

            /**
             * Callback trigger final part of template rendering
             */
            callback({
                template: targetCont,
                target: target,
                params: {
                    getParams: getParams.replace(/_/g, ' '),
                    resultList: resultList,
                    copy: appData.records.copy,
	                total: resultList.length,
                    votingEnabled: appData.commonOpts.voting.enabled
                }
            });

            templateEngine.liveSearchFocus();

            return this;
        },

        /**
         * Template inserting and History changing
         * @param {Object} p
         * @param {String} p.target — target #id container for template inserting
         * @param {String} p.template — template #id
         * @param {Object} p.params — Mustache params
         * @param {Object} p.params.replaceHistory — flag for changing History
         * @param {String} p.params.url — custom URL in History
         * @param {String} p.params.title — custom Title in History*
         * @param {String} p.params.getParams — pseudo GET params in search module
         * @returns {Object} templateEngine
         */
        insertTemplate: function(p) {
            var target = p.target || TARGET_CONT;
                $template = $('#'+ p.template),
                $target = $('#'+ target),
                callback = p.callback || function() {};

            var params = $.extend({}, p.params, appData.records[p.template]);
            $target.html( Mustache.to_html( $template.html(), params) );

            var actualParams = $.extend({}, params),
                actualUrl = actualParams.url || $template.attr('data-url'),
                actualTitle = actualParams.title || $template.attr('title') || document.title,
                cleanHash = '/',
                getParams = !!actualParams.getParams
                    ? '/'+actualParams.getParams.replace(/\s+/gi, '_')
                    : '';

            if (!!actualParams.replaceHistory && actualParams.replaceHistory) {
                actualParams.actualTitle = actualTitle;
                actualParams.actualUrl = actualUrl !== ''
                    ? cleanHash + '#!/'+actualUrl + getParams
                    : cleanHash;

                window.history.pushState(null, actualParams.actualTitle, actualParams.actualUrl);

            }

            callback();

            return this;
        },

        gotoSearchPage: function (addr) {
        	addr = addr.replace(/\s/ig, '_');
			window.location.hash = '!/search/' + addr;

			return this;
        },

        /**
         * Generate links to article of the same categoty
         * @param {Object} p
         * @param {String} p.query — target article's tag
         * @param {Function} p.callback
         * @param {Function} p.result   resorted collection with tags
         * @returns {Object} templateEngine
         */
        getCategoryByArticle: function(p) {
            var callback = p.callback || function(p) {},
                navList = [],
                template = 'nav-panel',
                target = 'nav-list',
                tagList = {},
                result = p.result;

            var i = result.length;
            while (i--) {
                var article = result[i],
                    tags = article.tags;

                var j = tags.length;
                while (j--) {
                    var tag = tags[j];
                    tagList[tag.tagTitle] = [tag.tagTitle, tag.tagLink];
                }
            }

            for (k in tagList) {
                // prevent article with same tag as p.query
                if ( p.query.match(new RegExp(k + '\\b', 'i')) ) continue;

                var tag = tagList[k];
                navList.push({
                    navLink: '/#!/search/' + tag[1].replace(/\s+/g, '_'),
                    navTitle: tag[0]
                });
            }

            callback({
                template: template,
                target: target,
                params: {
                    navList: navList
                }
            });

            return this;
        },

        /**
        * Extending articles list with votes data and sorting list by desc
        * @param {Array} resultList
        */
        attachVotes: function(resultList) {
            //var outResult = [];

            for (var i = 0; i < resultList.length; i++ ) {
                if ( !!voteData[resultList[i].id] ) {
                    resultList[i].votes = voteData[resultList[i].id].plusVotes - voteData[resultList[i].id].minusVotes;
                    if (resultList[i].votes > 0) {
                        resultList[i].popularity = 'positive'
                    } else if (resultList[i].votes < 0) {
                        resultList[i].popularity = 'negative'
                    }
                    else {
                        resultList[i].popularity = 'neutral'
                    }
                } else {
                    resultList[i].votes = 0;
                    resultList[i].popularity = 'neutral'
                }
            }

            resultList.sort(function (a, b) {
                if (a.votes > b.votes)
                    return -1;
                if (a.votes < b.votes)
                    return 1;
                // a must be equal to b
                return 0;
            });

            return this;
        },

        showMainPage: function() {
        	var mainPageInputText = $('#main-page .js-search-input').val();

        	$('#main-content').hide();
        	$('#main-page').show();

            if (!isTouch) { $('#main-page .js-search-input').focus() }
            $('#main-page .js-search-input').val(mainPageInputText);
        },

        showSecondaryPage: function() {
        	$('#main-content').show();
        	$('#main-page').hide();
        },

		liveSearchFocus: function() {
			var t = $('.js-search-input-interactive').val();

            if (!isTouch) { $('.js-search-input-interactive').focus(); }
            $('.js-search-input-interactive').val( t );
		}
    }
})();

var mainApp = function() {

    /**
     * Change banner background
     */

    $("#main-page").on('mouseenter', '.pricing-table', function(){
        var _this = $(this);
        if (_this.is('[class*=css]')) {
            $(".banner").attr('class','banner __css');
        } else if (_this.is('[class*=html]')) {
            $(".banner").attr('class','banner __html');
        } else {
            $(".banner").attr('class','banner');
        }
    });

    /**
     * Onready template rendering
     */
    templateEngine.checkHash();

    /**
     * On Back/Forward buttons press template render
     */
    window.addEventListener('popstate', function(e) {
    	templateEngine.checkHash();
    });

    /**
    * Language buttons events
    */
    $('.pure-menu').on('click', '.js-language', function() {
        // TODO: dmitryl: move this check to data-*
        // TODO: dmitryl: remove hardcode to 'en', 'ru', use appData.commonOpts.l18n

    	var lang = $(this).hasClass('__ru')? 'ru' : 'en';

    	var makeRedirect = function() {
    		$.ajax({
    			url: '/lang',
    			type: 'POST',
    			data: {
    				curr: window.location.hash,
    				lang: lang
    			},
    			success: function() {
    				window.location.reload();
    			}
    		})
    	};

    	makeRedirect();

    });

    /**
     * Search field on main page
     */
    $('#main-page').on('click', '.js-search-button', function(e) {
         e.preventDefault();

         var searchQuery = $.trim($('#main-page .js-search-input').val()),
             resultList = [];

        $.extend(true, resultList, templateEngine.fuzzySearch({
            q: searchQuery,
            allData: searchTagList
        }));

		for (var resultInstance = 0; resultInstance < resultList.length; resultInstance++) {
			var resultItem = resultList[resultInstance];

			for (var resultTags = 0; resultTags < resultItem.tags.length; resultTags++) {
				var title = resultItem.tags[resultTags],
					link = title.replace(/\s+/g, '_');

				resultItem.tags[resultTags] = {
					tagTitle: title,
					tagLink:link
				}
			}
		}

        if (resultList.length) {
            templateEngine.attachVotes(resultList);
        }

        templateEngine.insertTemplate( {
            template: 'search',
            params: {
                replaceHistory: true,
                getParams: searchQuery,
                total: resultList.length,
                resultList: resultList,
                votingEnabled: appData.commonOpts.voting.enabled
            }
        });

        templateEngine.insertTemplate( {
            template: 'main-page2',
            target: "main-source"
        });

        templateEngine.insertTemplate( {
            target: 'posts-output',
            template: 'search-output',
            params: {
                getParams: searchQuery,
                total: resultList.length,
                resultList: resultList,
                votingEnabled: appData.commonOpts.voting.enabled
            }
        });

        templateEngine.getCategoryByArticle({
            query: searchQuery,
            callback: function(p) {
                templateEngine.insertTemplate(p);
            },
            result: resultList
        });

		templateEngine.showSecondaryPage();
		templateEngine.liveSearchFocus();

        updateTitle();
    });

	$('#main-content').on('submit', 'form', function() {

		templateEngine.gotoSearchPage( $('.js-search-input-interactive').val() );

		return false;
	});

    /**
     * Search field on search page
     */
    $('#main-content').on('keyup', '.js-search-input-interactive', function(e) {

		// keyboard navigation on search results
    	if ( (e.keyCode == 38) || (e.keyCode == 40) || (e.keyCode == 13) ) {
    		return false;
    	}
    	if ( e.keyCode == 27 ) {
    		$('#main-content .js-search-input-interactive').blur();
    	}

        var searchQuery = $.trim($('#main-content .js-search-input-interactive').val()), /*js-search-input*/
            resultList = [];

        $.extend(true, resultList, templateEngine.fuzzySearch({
            q: searchQuery,
            allData: searchTagList
        }));

		for (var resultInstance = 0; resultInstance < resultList.length; resultInstance++) {
			var resultItem = resultList[resultInstance];

			for (var resultTags = 0; resultTags < resultItem.tags.length; resultTags++) {
				var title = resultItem.tags[resultTags],
					link = title.replace(/\s+/g, '_');

				resultItem.tags[resultTags] = {
					tagTitle: title,
					tagLink: link
				}
			}
		}

        if (resultList.length) {
			templateEngine.attachVotes(resultList);

            templateEngine.insertTemplate( {
                target: 'posts-output',
                template: 'search-output',
                params: {
                    getParams: searchQuery,
                    total: resultList.length,
                    resultList: resultList,
                    votingEnabled: appData.commonOpts.voting.enabled
                }
            });

            templateEngine.getCategoryByArticle({
                query: searchQuery,
                callback: function(p) {
                    templateEngine.insertTemplate(p);
                },
                result: resultList
            })

        }
    });

    /**
    * Arrow keys in search result
    */
    $('body').on('keydown keypress keyup', function(e) {
    	if ( (e.keyCode == 40) || (e.keyCode ==38) ) {
    		e.preventDefault();
    	}
    });

    $('body').on('keydown', function(e) {

    	function scrollToItem( $item ) {
    		var itemHeight = $item.outerHeight(),
    			itemVerticalOffset = $item.offset().top,
    			containerHeight = $('#main-content').outerHeight(),
    			windowHeight = $(window).height(),
    			newScrollTop = (itemHeight < windowHeight)
    				? itemVerticalOffset - 70 -(windowHeight - itemHeight)/2
    				: itemVerticalOffset - 150;

				$(window).scrollTop( newScrollTop );
    	}

    	function setFocusToLink( $item ) {
			scrollToItem( $item );

    		$item
    			.addClass('__in-focus');
    	}

    	function switchItem( direction ) {
    		var $current, $target;

    		if ( $('.article-item.__in-focus').length ) {
    			$current = $('.article-item.__in-focus');
    			$target = (direction == 'next')
    				? $current.next('.article-item')
    				: $current.prev('.article-item');

    			if (!$target.length) {
    				if ( $current.index('.article-item') == 0 ) {
    					var currentSearchValue = $('.js-search-input-interactive').val();

                        if (!isTouch) {$('.js-search-input-interactive').focus();}
    					$('.js-search-input-interactive').val(currentSearchValue);

    					$current.removeClass('__in-focus');
    				}

    				return false;
    			} else {
    				$current.removeClass('__in-focus');
    			}
    		} else {
    			if (direction == 'next') {
	    			$target = $('.article-item').first();
    			} else {
    				return false;
    			}
    		}

    		setFocusToLink( $target );
    	}

    	if (e.keyCode == 40) {
	    	switchItem('next');
    	}

    	if (e.keyCode == 38) {
	    	switchItem('prev');
    	}

    	if ( e.keyCode == 13 ) {
    		if ( $('.article-item.__in-focus').length ) {
    			e.preventDefault();
    			var addr = $( '.article-item.__in-focus .article-title-link' ).attr('href');
				window.location.href = addr;
    		}
    	}

    	if ( e.keyCode == 27 ) {
    		$('.article-item.__in-focus').removeClass('.__in-focus');
    	}
    });
};


/**
 * Page title update
 */
var updateTitle = function(){
    var currentWindowHash = window.location.hash.split('#!/'),
        pageName = currentWindowHash[1],
        title = appData.records.title, //Default title
        preparedTitle = appData.records.customTitle[pageName];

    if (typeof pageName !== 'undefined') {
        if (typeof preparedTitle === 'string') {
            title = preparedTitle + ' / ' + appData.records.shortTitle;
        } else if (pageName.split('/')[0] === 'search') {
            title = pageName.split('/')[1] + ' / ' + appData.records.shortTitle;
        }
    }

    document.title = title;
};

window.addEventListener('popstate', updateTitle, false);


/**
* Modal windows
*/
function closeModal(){
    $(".showModal").removeClass("showModal");
    $('body').removeClass('ovHidden');
}

function showModal( templateID ){
    if ( !templateID ) return false;

    $('body')
        .addClass('ovHidden')

        //close on ESC
        .on('keydown', function(e) {
            if ( e.which == 27) {
                closeModal();
            }
        })
    ;

    $('#' + templateID).addClass('showModal');
}

/**
 *
 * @returns {Object}    cookie string parsed into object
 */
function cookieParser() {
    var
        cookie = {},
        c = document.cookie.split('; '),
        cLen = c.length,
        arr;

    for (var i=0; i<cLen; i++) {
        arr = c[i].split('=');
        cookie[arr[0]] = arr[1];
    }

    return cookie;
}

var getAllDataDeffered = $.Deferred();
/**
 * Getting actual articles data
 * @param {Object} p
 * @param {Function} p.callback
 * @param {String} p.jsonData — path to json articles data
 */
var getAllData = function(p) {
    var callback = p.callback || function() {};

    $.ajax({
        url: p.jsonData,
        success: function(data) {

            totalTagList = $.extend(true, totalTagList, data);

            for (k in data) {
                var prop = data[k],
                    j = prop.length;

                while (j--) {
                    searchTagList.push(prop[j]);
                }
            }

            templateEngine.extendingTags();

            getAllDataDeffered.resolve();

            callback();
        }
    });
};

/**
 * Getting actual voting data
 * @param {Object} p
 * @param {String} p.jsonData — path to json votes data
 * @param {String} p.language — setting for database output
 */
var getVoteData = function(p) {
    var callback = p.callback || function() {};

    var dataUrl = p.jsonData,
        cacheNeeded = true;

    //If logged, give latest info
    if(appData.commonOpts.voting.enabled && localStorage['user']) {
        dataUrl = '/getAllVotes';
        cacheNeeded = false
    }

    //If not logged, give cached latest info
    $.ajax({
        cache: cacheNeeded,
        data: p.language,
        url: dataUrl,
            success: function(data) {
                var votesJSON = data;

                var voteLength = data.length;
                while(voteLength--) {
                    voteData[ votesJSON[voteLength]['_id'] ] = votesJSON[voteLength];
                }

                callback();
            }
    })

};

/**
* Localization module on client
* Getting articles and voting data for specific language
*/
var getJsonData = function(p) {
	var
        currentLanguage,
		languages = {
			en: {
				data: 'output/all-data.json',
				votes: 'output/all-votes.json'
			},
			ru: {
				data: 'output/ru/all-data.json',
				votes: 'output/ru/all-votes.json'
			}
		},
		callback = p.callback || function() {};

	// if p.lang not set, it equals to default lang (as set in common options on server)
	currentLanguage = (languages[p.lang]) ? p.lang : appData.commonOpts.l18n.defaultLang;

	// Execution getting operations
    getAllData({
    	jsonData: languages[currentLanguage]['data'],
    	callback: function() {
			getVoteData({
				jsonData: languages[currentLanguage]['votes'],
				language: {
					lang: currentLanguage
				},
				callback: function() {
					callback();
				}
			})
    	}
    })
};

/**
 * Onstart routines
 */
var currentLanguage = cookieParser(document.cookie)['lang'] || appData.commonOpts.l18n.defaultLang;

$(function() {

	/**
	* Main page autosuggest init
	*/
	var prepareAutosuggest = function() {
		var suggest = [];

        for (var i=0; i < searchTagList.length; i++ ) {
            var targetObj = searchTagList[i],
                tags = targetObj.tags;

            for (var mi=0; mi < tags.length; mi++ ) {
                var tag = tags[mi];

                if (suggest.indexOf(tag) === -1) {
                    suggest.push(tag);
                }
            }
        }

		$('#main-page .js-search-input')
			.autocomplete({
				minChars:1,
				delimiter: /(,|;)\s*/, // regex or character
				maxHeight:215,
				width:321,
				zIndex: 9999,
                lookupLimit: 6,
				appendTo: '.home-search',
				triggerSelectOnValidInput: false,
				deferRequestBy: 0, //miliseconds
				noCache: false, //default is false, set to true to disable caching
				onSelect: function() {
					//window.location.hash = '!/search/' + $(this).val();
				},
				lookup: suggest
			})
			.off('focus')
			.on('keyup', function(e) {
				if (e.keyCode == 13) {
					templateEngine.gotoSearchPage( $(this).val() );
				}
			});

		$('#main-page').on('click', '.autocomplete-suggestion', function() {
			templateEngine.gotoSearchPage( $(this).text() );
		})

	};

    /**
     * Gets templates and starts The App
     */
    var prepateTemplates = function() {
        $.ajax({
            url: "build/templates.html",
            cache: false,
            success: function(data) {
                $('body').append(data);
                mainApp();

                // First page visit title update
                updateTitle();

                checkAuth();
            },
            dataType: 'text'
        })
    };


    /**
     * Getting data and rendering templates
     */
    getJsonData({
    	lang: currentLanguage,
    	callback: function() {
	    	prepateTemplates();
	    	prepareAutosuggest();
    	}
    });


    /**
     * Mobile UI: hidden menus togglers
     */

	//var mobileParts = $('.mobile-menu-part');

	$('.pure-menu, #main-content').on('click', '.mobile-menu-toggle', function(){
		var _this = $(this);

		_this.toggleClass('pure-button-active');
		_this.parents('div').find('.mobile-menu-part').toggleClass('__active');

	});

    window.addEventListener('popstate', function(e) {
        $('.mobile-menu-toggle').removeClass('pure-button-active');
        $('.mobile-menu-toggle').parents('div').find('.mobile-menu-part').removeClass('__active');
    });
});

