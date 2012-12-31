
// references:
// heatmap (2d histogram) http://bl.ocks.org/3202354
// histogram layout http://bl.ocks.org/3048450 https://github.com/mbostock/d3/wiki/Histogram-Layout#wiki-histogram
// multiple thingies: http://bl.ocks.org/1305111


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
		/*
		var d0 = new Date(2012, 1, 1);
		var d1 = new Date(2012, 1, 2);
		var d2 = new Date(2012, 1, 3);
		// no d3 :)
		var d4 = new Date(2012, 1, 5);
		data = [
			{date: d0, msg: "a"},
			{date: d0, msg: "a"},
			{date: d0, msg: "a"},
			{date: d0, msg: "a"},
			{date: d0, msg: "b"},
			{date: d1, msg: "a"},
			{date: d1, msg: "a"},
			{date: d2, msg: "a"},
			{date: d4, msg: "b"}
		];
		*/
		var minDate = data.minDate;
		var maxDate = data.maxDate;

		// Compute the useful interval
		var deltaMillis = (data.maxDate.getTime() - data.minDate.getTime());
		// Useful intervals:
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

		var margin = {top: 20, right: 90, bottom: 30, left: 50},
		    width = 800 - margin.left - margin.right,
			height = 200 - margin.top - margin.bottom;

		var svg = d3.select(id).selectAll("svg")
				.data(nest);
		var svgg = svg.enter().append("svg:svg")
				.attr("width", width + margin.left + margin.right)
				.attr("height", height + margin.top + margin.bottom)
				.append("g")
				.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
		svgg.append("text").text(function(d) { return d.key; });

		// This is the time scale.
		var x = d3.time.scale().range([0, width]);
		x.domain([minDate, maxDate]);

		var y = d3.scale.linear()
			.domain([0, maxSeenCounts])
			.range([height, 0]);	

		var bar = svgg.selectAll(".bar").data(function(x) { return x.values })
  			.enter().append("g")
  			.attr("class", "bar")
  			// it's pretty hateful that we have to convert d.key back into a date!
    		.attr("transform", function(d, i) { return "translate(" + x(new Date(d.key)) + "," + y(d.values) + ")"; });

    	bar.append("rect")
    		.attr("x", 1)
    		.attr("width", width / ( (maxDate.getTime() - minDate.getTime()) / stepMillis) )
    		.attr("height", function(d) { return height - y(d.values); })
    		.attr("fill", "steelblue");

   		// Add an x-axis with label.
	    var formatDate = d3.time.format("%b %d %H:%M:%S");
   		svgg.append("g")
	   		.attr("class", "x axis")
	   		.attr("transform", "translate(0," + height + ")")
	   		.call(d3.svg.axis()
	   			.scale(x)
	   			.ticks( (maxDate.getTime() - minDate.getTime())/stepMillis)
	   			.tickFormat(formatDate).orient("bottom"))
	   		.append("text")
	   		.attr("class", "label")
	   		.attr("x", width)
	   		.attr("y", -6)
	   		.attr("text-anchor", "end")
	   		.text("Date");

		// Add a y-axis with label.
		svgg.append("g")
		    .attr("class", "y axis")
		    .call(d3.svg.axis().scale(y).orient("left"))
		  .append("text")
		    .attr("class", "label")
		    .attr("y", 6)
		    .attr("dy", ".71em")
		    .attr("text-anchor", "end")
		    .attr("transform", "rotate(-90)")
		    .text("Value");

/*
		data = {abc: [1, 2, 2, 3, 14], def: [20, 20, 20, 2, 14]};
		data = [
			{key: "abc", cnts: [1,2,3]}, 
			{key: "def", cnts: [50, 10, 10]}
		];
		var width = 600;
		var height = 60;
		var svg = d3.select(id).selectAll("svg")
				.data(data)
			.enter().append("svg:svg")
				.attr("width", width)
				.attr("height", height);

		var x = d3.scale.linear()
			.domain([0, 6])
			.range([0, width]);

		var y = d3.scale.linear()
			.domain([0, 30])
			.range([height, 0]);	

		var bar = svg.selectAll(".bar").data(function(x) { return x.cnts })
  			.enter().append("g")
  			.attr("class", "bar")
    		.attr("transform", function(d, i) { return "translate(" + x(i) + "," + y(d) + ")"; });

    	bar.append("rect")
    		.attr("x", 1)
    		.attr("width", 10)
    		.attr("height", function(d) { return height - y(d); });
    		*/
	}

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

	var work = function() {
		// var sample = "2012-04-22 10:19:36,793  INFO A1234\n2012-04-22 10:29:36,793  INFO A2345\n";
		// var text = $('textarea')[0].value;
		d3.text("logsmall.txt", function(d) {
			console.profile();
			var parsed = parseLogFile(d);
			display("#fucker", parsed);
			console.profileEnd();
		});

	};

	// display("#fucker", undefined);
	work();
	testSomeStuff();
});