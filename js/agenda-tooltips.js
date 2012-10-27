define(['lib/d3.v2'], function () {
    var d3 = window.d3,
        flor = function (val, _flor) {
            return val < _flor ? _flor : val;
        },
        ciel = function (val, _ciel) {
            return val > _ciel ? _ciel : val;
        };

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
        this.canvas_width = svg.attr('width');
        this.box_stroke_width = +this.tooltip.style('stroke-width').slice(0, -2);
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
            var padding = 10,
                margin = 10,
                text_w = +this.text.style('width').slice(0, -2) | 0,
                text_h = +this.text.style('height').slice(0, -2) | 0,
                box_width = text_w + 2*padding,
                box_height = text_h + 2*padding,
                x_box = x - box_width/2,
                y_box = y - box_height - margin;

            x_box = ciel(flor(x_box, this.box_stroke_width), this.canvas_width - box_width - 2 * this.box_stroke_width);
            y_box = flor(y_box, this.box_stroke_width);

            this.tooltip.attr('width', box_width)
                .attr('height', box_height)
                .attr('x', x_box)
                .attr('y', y_box);
            this.text.attr('x', x_box + text_w + padding + this.box_stroke_width)
                .attr('y', y_box + text_h + padding - this.box_stroke_width);
        }
    };

    return Tooltip;
});
