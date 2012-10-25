function Tooltip(tooltipId, width){
	d3.select("body").append("div").attr("class", "tooltip").attr("id", tooltipId);

	if(width){
		d3.select("#"+tooltipId).style("width", width + 'px');
	}

	hideTooltip();

	function showTooltip(content, event){
		d3.select("#"+tooltipId).html(content);
		d3.select("#"+tooltipId).style("display", "block");

		updatePosition(event);
	}

	function hideTooltip(){
        d3.select("#"+tooltipId).style("display", "none");
	}

	function updatePosition(event){
		var ttid = "#"+tooltipId;
		var xOffset = 20;
		var yOffset = 10;

		var ttw = d3.select(ttid).style('width');
		var tth = d3.select(ttid).style('height');
		var wscrY = d3.select("body").property('scrollTop');
		var wscrX = d3.select("body").property('scrollLeft');
		var curX = document.all ? event.clientX + wscrX : event.pageX;
		var curY = document.all ? event.clientY + wscrY : event.pageY;
		var ttleft = ((curX - wscrX + xOffset*2 + ttw) > window.innerWidth) ? curX - ttw - xOffset*2 : curX + xOffset;
		if (ttleft < wscrX + xOffset){
			ttleft = wscrX + xOffset;
		}
		var tttop = ((curY - wscrY + yOffset*2 + tth) > window.innerHeight) ? curY - tth - yOffset*2 : curY + yOffset;
		if (tttop < wscrY + yOffset){
			tttop = curY + yOffset;
		}
		d3.select(ttid).style("top", tttop + "px");
		d3.select(ttid).style("left", ttleft + "px");
		d3.select(ttid).style("pointer-events", "none");
	}

	return {
		showTooltip: showTooltip,
		hideTooltip: hideTooltip,
		updatePosition: updatePosition
	};
}