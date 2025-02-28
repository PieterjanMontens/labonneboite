(function($) {
  function disableDistanceSearch() {
    $("[name='d'][value='3000']").prop('checked', true);
  }
  function disableDurationSearch() {
    $("[name='dur']").prop('checked', false);
  }
  function createFunctionWithTimeout(callback, opt_timeout) {
    // Inspired by https://developers.google.com/analytics/devguides/collection/analyticsjs/sending-hits
    // This is useful for sending GA events synchronously
    var called = false;
    function fn() {
      if (!called) {
        called = true;
        callback();
      }
    }
    setTimeout(fn, opt_timeout || 1000);
    return fn;
  }

  function initForm() {
    "use strict";

    // Based on:
    // https://github.com/scottgonzalez/jquery-ui-extensions/blob/master/src/autocomplete/jquery.ui.autocomplete.html.js
    // Removed initSource and filter function to enable html autocomplete on ajax source.
    // ---------------------------------------------

    var proto = $.ui.autocomplete.prototype;
    var initSource = proto._initSource;

    $.extend(proto, {
      _initSource: function () {
        initSource.call(this);
      },
      _renderItem: function (ul, item) {
        var stuff = $("<li></li>")
          .data("item.autocomplete", item)
          .append($("<a></a>")[this.options.html ? "html" : "text"](item.label))
          .appendTo(ul);
        return stuff;
      }
    });

    // Search form with autocompletes.
    // ---------------------------------------------

    // Form.
    var searchForm = $('.js-search-form');

    // Inputs.
    var inputJob = $("input[name='j']");
    var inputOccupation = $('#occupation');
    var inputLocation = $("#l");
    var inputLatitude = $("#lat");
    var inputLongitude = $("#lon");

    var initialOccupation = inputOccupation.val();

    // Job.
    var setJob = function (item) {
      if (item) {
        inputOccupation.val(item.occupation);
      }
    };

    // Location.
    var setLocation = function (item) {
      if (item) {
        inputLatitude.val(item.latitude);
        inputLongitude.val(item.longitude);
      }
    };
    if (!inputLocation.val() && inputLocation.attr("value")) {
        // Believe it or not, an input field with a "value" attr may have an empty
        // displayed value...
        inputLocation.val(inputLocation.attr("value"));
    }

    var getLocationsFromLBB = function (request, responseCB) {
      $.getJSON('/autocomplete/locations?term=' + request.term, function (lbb_response) {
        responseCB(lbb_response);
      });
    };

    // Configure autocompletes.
    inputJob.autocomplete({
      delay: 200,
      html: true,
      minLength: 2,
      position: {my: "left top", at: "left bottom"},
      open: function (event, ui) {
        $('.ui-autocomplete').off('menufocus hover mouseover mouseenter');
      },
      source: "/suggest_job_labels",
      response: function (event, ui) {
        if (ui.content) {
          // Auto-set the first result just in case the user does not click on an autocomplete suggestion.
          setJob(ui.content[0]);
        }
      },
      select: function (event, ui) {
        setJob(ui.item);
        // The TAB key will set the focus on the next element. If another key is pressed, set the focus.
        if (event.keyCode !== 9) {
          inputLocation.val().length ? searchForm.find(':submit').focus() : inputLocation.focus();
        }
      },
    });
    inputLocation.autocomplete({
      delay: 200,
      html: true,
      minLength: 2,
      position: {my: "left top", at: "left bottom"},
      open: function (event, ui) {
        $('.ui-autocomplete').off('menufocus hover mouseover mouseenter');
      },
      source: getLocationsFromLBB,
      response: function (event, ui) {
        if (ui.content) {
          // Auto-set the first result just in case the user does not click on an autocomplete suggestion.
          setLocation(ui.content[0]);
        }
      },
      select: function (event, ui) {
        setLocation(ui.item);
        // The TAB key will set the focus on the next element. If another key is pressed, set the focus.
        if (event.keyCode !== 9) {
          inputJob.val().length ? searchForm.find(':submit').focus() : inputJob.focus();
        }
      },
    });


    // When the search form is submitted.
    var currentRequestUrl = null;
    searchForm.on('submit', function (event, options) {
      // Reset the "naf" (business sector) filter when a new search is performed.
      if (initialOccupation && initialOccupation !== inputOccupation.val()) {
        $("#naf").val('');
      }
      // Disable the submit button and display a spinner.
      searchForm.find('button:submit').prop('disabled', true);
      searchForm.find('button:submit img').remove();
      searchForm.find('.spinner').removeClass('hidden');

      // Page update is a consequence of map movement: we need to update the page
      // content asynchronously and re-init everrything.
      if (options && options.async) {
        event.preventDefault();
        var url = "/entreprises?" + $(this).serialize();

        currentRequestUrl = url;
        $.get(url,
          function(response) {
            // Prevent simultaneous requests
            if (url !== currentRequestUrl) {
              return;
            }
            $("#content").html(response);
            window.history.pushState(null, "", url);
            // trigger ready event on the whole document
            $(document).trigger('lbbready');
          }
        );
      }
    });

    // Auto-submit the search form when any form element is changed in the sidebar.
    $('.js-form-search-filters :input').on('change', function (e) {
      if(e.currentTarget.name === "dur") {
        // If duration search is selected then disable distance search
        disableDistanceSearch();
      } else if (e.currentTarget.name === "d") {
        // If distance search is selected then disable duration search
        disableDurationSearch();
      }
      searchForm.submit();
    });

    // Toggle duration/distance switches
    $('#distance-duration-switch .switch-element').on('click', function (e) {
        var switchValue = e.currentTarget.attributes["data-switch-value"].value;
        var currentSwitchValue = $('#distance-duration-switch').attr('data-switch-value-selected');
        if (currentSwitchValue !== switchValue) {
          ga('send', 'event', 'Form', 'click', switchValue);
          $('#distance-duration-switch').attr('data-switch-value-selected', switchValue);
        }
    });

    // Auto-submit the search form when a link to expand the search results by occupation is clicked.
    $('.js-extend-search-occupation').click(function (e) {
      e.preventDefault();
      inputOccupation.val(this.dataset.occupation);
      searchForm.submit();
    });

    // Auto-submit the search form when a link to expand the search results by distance is clicked.
    $('.js-extend-search-distance').click(function (e) {
      e.preventDefault();
      $(':radio[name=d][value=' + this.dataset.distance + ']').prop('checked', true);
      searchForm.submit();
    });

    // Toggle transport icon on click and uncheck already checked duration.
    searchForm.find('[data-travelmode]').on('click', function (e) {
      e.preventDefault();
      var travelMode = $(this).attr("data-travelmode");
      searchForm.find('.travelmode-choice a').toggleClass('hidden');
      searchForm.find("[name='tr']").attr("value", travelMode);
      ga('send', 'event', 'Form', 'click', 'travelmode-' + travelMode);
      if (searchForm.find('#isochrone-durations input').is(':checked')) {
        searchForm.find('#isochrone-durations input').prop('checked', false);
      }
    });

    // Submit form when a checked duration is clicked.
    searchForm.find('#isochrone-durations input').on('click', function(){
      searchForm.submit();
    });
  }

  $(document).on('lbbready', function () {
      initForm();
  });

})(jQuery);
