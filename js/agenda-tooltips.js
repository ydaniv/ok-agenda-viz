define(['lib/d3.v2'], function () {
    var d3 = window.d3;

    function Tooltip (svg) {
        if ( ! (this instanceof Tooltip) ) return new Tooltip(svg);

        this.container = svg.append('g');
        this.tooltip = this.container.append('rect')
            .attr('width', '40')
            .attr('height', '40')
            .attr('ry', '10')
            .attr('rx', '10')
            .attr('class', 'tooltip');
        this.text = this.container.append('text')
            .attr('font-family', 'sans-serif')
            .attr('fill', '#000000')
            .attr('font-size', 12);
        this.hideTooltip();
    }

    Tooltip.prototype = {
        constructor     : Tooltip,
        showTooltip     : function (content, x, y) {
            this.text.text(content);
            this.updatePosition(x, y);
            this.container.style("visibility", "visible");
        },
        hideTooltip     : function () {
            this.container.style("visibility", "hidden");
        },
        updatePosition  : function (x, y) {
            var padding = 10*2;
            var margin = 10;
            var text_w = +this.text.style('width').slice(0, -2) | 0;
            var text_h = +this.text.style('height').slice(0, -2) | 0;
            var box_width = text_w + padding;
            var box_height = text_h + padding;

            this.tooltip.attr('width', box_width)
                .attr('height', box_height)
                .attr('x', x - box_width/2)
                .attr('y', y - box_height - margin);
            this.text.attr('x', x + text_w/2)
                .attr('y', y - text_h - margin);
        }
    };

    return Tooltip;
});
