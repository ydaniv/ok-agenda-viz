define(['../lib/d3.v2'], function () {
    var d3 = window.d3,
        flor = function (val, _flor) {
            return val < _flor ? _flor : val;
        },
        ciel = function (val, _ciel) {
            return val > _ciel ? _ciel : val;
        };

    function Tooltip (svg) {
        if ( ! (this instanceof Tooltip) ) return new Tooltip(svg);

        this.container = svg.append('g').style('pointer-events', 'none');
        this.tooltip = this.container.append('rect')
                            .attr('width', '40')
                            .attr('height', '40')
                            .attr('ry', '10')
                            .attr('rx', '10')
                            .attr('class', 'tooltip');
        this.text = this.container.append('text')
                                .attr('font-family', 'sans-serif')
                                .attr('fill', '#fff')
                                .attr('font-size', 16);
        this.canvas_width = svg.attr('width');
        this.hideTooltip();
    }

    Tooltip.prototype = {
        constructor     : Tooltip,
        showTooltip     : function (content, color, x, y, image) {
            this.text.text(content);
            this.tooltip.attr('fill', color);
            if ( this.image ) {
                this.image.remove();
            }
            if ( image ) {
                this.image = this.container.append('image')
                                            .attr('width', 45)
                                            .attr('height', 60)
                                            .attr('xlink:href', image);
            }
            this.updatePosition(x, y);
            this.container.style("visibility", "visible");
        },
        hideTooltip     : function () {
            this.container.style("visibility", "hidden");
        },
        updatePosition  : function (x, y) {
            var padding = 10,
                margin = 10,
                image_margin = 50,
                text_w = +this.text.style('width').slice(0, -2) | 0,
                text_h = +this.text.style('height').slice(0, -2) | 0,
                box_width = text_w + 2*padding,
                box_height = text_h + 2*padding,
                x_box = x - box_width/2,
                y_box = y - box_height - margin;
            
            x_box = ciel(flor(x_box, 2), this.canvas_width - box_width);
            y_box = flor(y_box, image_margin + 2);

            if ( this.image ) {
                this.image.attr('x', x_box + box_width/2 - 21)
                            .attr('y', y_box - image_margin);
            }
            this.tooltip.attr('width', box_width)
                        .attr('height', box_height)
                        .attr('x', x_box)
                        .attr('y', y_box);
            this.text.attr('x', x_box + padding + text_w + 3)
                        .attr('y', y_box + padding + text_h - 3);
        }
    };

    return Tooltip;
});
