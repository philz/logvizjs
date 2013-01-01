//
$(function() {
	"use strict";

	var REASONABLE_BUCKETS = 100;

	// For lack of a test framework...
	var assertEquals = function(expected, actual) {
		if (expected != actual) {
			console.log("expected: " + expected);
			console.log("  actual: " + actual);
			debugger;
			throw "Not equal!";
		}
	}

	// Takes a logfile string, parses out the dates, and returns 
	// { minDate: ..., maxDate: ..., logLines: [{ date: ..., msg: ...}] }
	// minDate and maxDate are preserved.
	var parseLogFile = function(log) {
		var re = /([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{1,2}):([0-9]{2}):([0-9]{2}),(?:[0-9]{3}) (.*)/g;
		var ret = {
			minDate: undefined,
			maxDate: undefined,
			logLines: []
		}
		var cur;
		var d;

		while (cur = re.exec(log)) {
			d = new Date(cur[1], cur[2], cur[3], cur[4], cur[5], cur[6]);
			if (!ret.minDate || ret.minDate.getTime() > d.getTime()) {
				ret.minDate = d;
			}
			if (!ret.maxDate || ret.maxDate.getTime() < d.getTime()) {
				ret.maxDate = d;
			}
			ret.logLines.push({
				date: new Date(cur[1], cur[2], cur[3], cur[4], cur[5], cur[6]),
				msg: cur[7]
			});
		}
		return ret;
	};

	// Removes numbers (and other things?)
	var normalizeLogMessage = function(msg) {
		var ipAddress = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g;
		msg = msg.replace(ipAddress, "<ip>");
		var numeric = /[0-9]+/g;
		return msg.replace(numeric, "NN");
	};

	var groupBy = function(data) {
		return _.groupBy(data.logLines, function (logLine) { return normalizeLogMessage(logLine.msg); });
	}

	var roundDate = function(date, round) {
		return new Date(round * Math.floor(date.getTime() / round));
	}

	// Uses d3 to draw multiple histograms.
	var display = function(id, data) {
		var i;
		var minDate = data.minDate;
		var maxDate = data.maxDate;

		// Compute the useful interval
		var deltaMillis = (data.maxDate.getTime() - data.minDate.getTime());
		// Useful intervals.  Couldn't figure out how to use the
		// d3 time intervals here.
		var usefulIntervals = [ 
			1000, // 1 sec
			60*1000, // 1 min
			5*60*1000, // 5 min
			10*60*1000, // 10 min
			30*60*1000, // 30 min
			60*60*1000, // 1 hr
			2*60*60*1000, // 2hr
			4*60*60*1000, // 4hr
			6*60*60*1000, // 6hr
			12*60*60*1000, // 12hr
			24*60*60*1000, // 1 day
		];

		// Iterate one short, since last one is always the max.
		for (i = 0; i < usefulIntervals.Length - 1; ++i) {
			if (deltaMillis / usefulIntervals[i] < REASONABLE_BUCKETS) {
				break;
			}
		}
		var stepMillis = usefulIntervals[i];
		console.log("Min date %s, max date %s, delta %s, chose interval %s", minDate, maxDate, deltaMillis, stepMillis);

		minDate = roundDate(minDate, stepMillis);
		maxDate = new Date(roundDate(maxDate, stepMillis).getTime() + stepMillis);

		var maxSeenCounts = 0;
		var nest = d3.nest()
			.key(function(d) { return normalizeLogMessage(d.msg)})
			.key(function(d) { return roundDate(d.date, stepMillis); })
			.rollup(function(d) { maxSeenCounts = Math.max(maxSeenCounts, d.length); return d.length; })
			.entries(data.logLines);

		var margin = {top: 30, right: 90, bottom: 30, left: 50},
		    width = 800 - margin.left - margin.right,
			height = 200 - margin.top - margin.bottom;

		var svg = d3.select(id).insert("svg")
			.attr("width", width + margin.left + margin.right)
			.attr("height", nest.length * (height + margin.top + margin.bottom));

		var svgg = svg.selectAll("g").data(nest)
			.enter().append("g")
			.attr("transform", function(d, i) { 
				return "translate(" + margin.left + "," + (margin.top + i*(margin.top + height + margin.bottom)) + ")"; });
		svgg.append("text").attr("transform", "translate(20, -10)").text(function(d) { return d.key; });

		// Time scale
		var x = d3.time.scale().range([0, width]);
		x.domain([minDate, maxDate]);

		// Vertical scale.  Gets re-scaled with every piece of data.
		// The vertical scale is local, so it's not defined here.
		// var y = d3.scale.linear()
		//	.domain([0, maxSeenCounts])
		//	.range([height, 0]);	

		// Color
		//var z = d3.scale.quantize()
		//	.domain([0, maxSeenCounts])
		//	.range(d3.range(9).map(function(i) { return "q" + i + "-9"; }));

		var z = d3.scale.log().domain([1, maxSeenCounts]).range(["white", "steelblue"]);

		var bar = svgg.selectAll(".bar").data(function(x) { 
					var localMax = d3.max(x.values.map(function(y) { return y.values; }));
					x.scale = d3.scale.linear()
						.domain([0, localMax])
						.range([height, 0]);	
					return x.values; 
				})
  			.enter().append("g")
  			.attr("class", "bar")
    		.attr("transform", function(d, i) { 
    			// Note that above we set this, and now we reference
    			// this.  No idea how to do this more appropriately
    			// in d3.
    			var localy = this.parentNode.__data__.scale; 
	  			// it's pretty hateful that we have to convert d.key back into a date!
    			return "translate(" + x(new Date(d.key)) + "," + localy(d.values) + ")"; 
    		});

    	bar.append("rect")
    		.attr("x", 1)
    		.attr("width", width / ( (maxDate.getTime() - minDate.getTime()) / stepMillis) )
    		.attr("height", function(d) { 
    			var localy = this.parentNode.parentNode.__data__.scale; 
    			return height - localy(d.values); 
    		})
    		// .attr("fill", "steelblue")
    		// .attr("class", function(d) { return z(d.values); });
    		.attr("stroke", "steelblue")
    		.attr("fill", function(d) { return z(d.values); });

   		// Add an x-axis with label.
   		svgg.append("g")
	   		.attr("class", "x axis")
	   		.attr("transform", "translate(0," + height + ")")
	   		.call(d3.svg.axis()
	   			.scale(x)
	   			.ticks(5) // bad? // (maxDate.getTime() - minDate.getTime())/stepMillis)
	   		    .orient("bottom"));
	   		// .append("text") .attr("class", "label") .attr("x", width) .attr("y", -6) .attr("text-anchor", "end") .text("Date");

		// Add a y-axis with label.
		svgg.append("g")
		    .attr("class", "y axis")
		    // This sets up an axis for each histogram.  There's gotta
		    // be a faster way to do this.
		    .call(function(u) { u.each(function(v) { d3.svg.axis().ticks(5).scale(v.scale).orient("left")(d3.select(this)) }) })
		  .append("text")
		    .attr("class", "label")
		    .attr("y", 6)
		    .attr("dy", ".71em")
		    .attr("text-anchor", "end")
		    .attr("transform", "rotate(-90)")
		    .text("Count");

		return;
	};

	/* Ack. JS can't decide on a single test framework, so I had to write my own? */
	var testSomeStuff = function() {
		var sample = "2012-04-22 10:19:36,793  INFO A1234\n2012-04-22 10:29:36,793  INFO A2345\n";
		var parsed = parseLogFile(sample);

		assertEquals(
			  '{"minDate":"2012-05-22T17:19:36.000Z",'
			+ '"maxDate":"2012-05-22T17:29:36.000Z",'
			+ '"logLines":[{"date":"2012-05-22T17:19:36.000Z","msg":" INFO A1234"},' 
			+ '{"date":"2012-05-22T17:29:36.000Z","msg":" INFO A2345"}]}',
			JSON.stringify(parsed));

		assertEquals(
			"<ip> abcNN NN",
			normalizeLogMessage("1.1.1.2 abc123 4"));

		assertEquals(
			1356915600000,
			roundDate(new Date(1356917825836), 1000*60*60).getTime());
	};

	var parseAndShow = function(text) {
		var parsed = parseLogFile(text);
		$('#viz').empty();
		display("#viz", parsed);
	}

	var work = function() {
		// var text = $('textarea')[0].value;
		d3.text("log_tiny.txt", function(d) {
			console.profile();
			parseAndShow(d);
			console.profileEnd();
		});

	};

	var attachHandlers = function() {
		$('#fileinput').change(function(ev) {
			var fileReader = new FileReader();
			fileReader.onloadend = function(e) {
				var result = fileReader.result;
				parseAndShow(result);
			};
			if (ev.target.files) {
				fileReader.readAsText(ev.target.files[0]);
			}
		});
		$('#urlbutton').click(function(ev) {
			var url = $('#urlinput')[0].value;
			d3.text(url, parseAndShow);
		});
	};

	work();
	testSomeStuff();
	attachHandlers();
});
