({
    baseUrl         : './src',
    paths           : {
        'd3'    : '../lib/d3.v2',
        reqwest : '../lib/reqwest',
        when    : '../lib/when'
    },
    optimize        : 'uglify',
    optimizeCss     : 'none',
    removeCombined  : false,
    name            : 'agenda-viz',
    out             : './dist/agenda-viz-1.0.js' 
})