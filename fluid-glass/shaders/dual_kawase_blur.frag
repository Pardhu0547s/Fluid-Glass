// Dual Kawase blur shader (downsample + tent upsample), used as a Cogl fragment snippet.
// Pass mode: 0.0 = downsample (5-tap), 1.0 = upsample (8-tap tent filter).

uniform vec2 inv_size;     /* 1/width, 1/height of the source texture */
uniform float blur_radius; /* sample offset in source texels */
uniform float pass_mode;   /* 0.0 = downsample, 1.0 = upsample */

void main() {
    vec2 uv = cogl_tex_coord_in[0].st;
    float r = blur_radius;

    if (pass_mode < 0.5) {
        vec4 col  = texture2D(cogl_sampler0, uv) * 4.0;
        col += texture2D(cogl_sampler0, uv + vec2( r,  r) * inv_size);
        col += texture2D(cogl_sampler0, uv + vec2( r, -r) * inv_size);
        col += texture2D(cogl_sampler0, uv + vec2(-r,  r) * inv_size);
        col += texture2D(cogl_sampler0, uv + vec2(-r, -r) * inv_size);
        cogl_color_out = col / 8.0;
    } else {
        vec4 col;
        col  = texture2D(cogl_sampler0, uv + vec2(-r,  0.0) * inv_size) * 2.0;
        col += texture2D(cogl_sampler0, uv + vec2( r,  0.0) * inv_size) * 2.0;
        col += texture2D(cogl_sampler0, uv + vec2( 0.0, -r) * inv_size) * 2.0;
        col += texture2D(cogl_sampler0, uv + vec2( 0.0,  r) * inv_size) * 2.0;
        col += texture2D(cogl_sampler0, uv + vec2(-r, -r) * inv_size);
        col += texture2D(cogl_sampler0, uv + vec2( r, -r) * inv_size);
        col += texture2D(cogl_sampler0, uv + vec2(-r,  r) * inv_size);
        col += texture2D(cogl_sampler0, uv + vec2( r,  r) * inv_size);
        cogl_color_out = col / 12.0;
    }
}
