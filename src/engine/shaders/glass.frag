#version 330 core

/*
 * Fluid Glass optical surface prototype.
 *
 * This shader expects a compositor-provided backdrop texture. It is NOT wired
 * into GNOME Shell alpha 1; the extension currently uses Shell.BlurEffect.
 * The inputs are explicit so this can be developed and tested in a standalone
 * GL harness before selecting a supported compositor integration path.
 */

uniform sampler2D u_backdrop;
uniform vec2  u_surface_size;
uniform float u_corner_radius;
uniform float u_refraction_strength;
uniform float u_dispersion;
uniform float u_edge_width;
uniform float u_tint_strength;
uniform vec3  u_tint_color;
uniform vec2  u_light_direction;

in vec2 v_uv;
out vec4 frag_color;

float rounded_box_sdf(vec2 p, vec2 half_size, float radius) {
    vec2 q = abs(p) - half_size + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
    vec2 half_size = 0.5 * u_surface_size;
    vec2 local_px = (v_uv - vec2(0.5)) * u_surface_size;
    float distance_to_edge = rounded_box_sdf(local_px, half_size, u_corner_radius);

    // Discard fragments outside the rounded glass card.
    float coverage = 1.0 - smoothstep(0.0, 1.25, distance_to_edge);
    if (coverage <= 0.001)
        discard;

    // The SDF gradient approximates the normal along the rounded perimeter.
    vec2 edge_normal = normalize(vec2(dFdx(distance_to_edge), dFdy(distance_to_edge)));
    float edge_weight = 1.0 - smoothstep(0.0, max(u_edge_width, 1.0), -distance_to_edge);
    vec2 refract_axis = edge_normal * edge_weight * u_refraction_strength;

    // Slight channel separation: deliberately subtle to avoid rainbow fringes.
    vec2 uv_r = v_uv + refract_axis * (1.0 + u_dispersion);
    vec2 uv_g = v_uv + refract_axis;
    vec2 uv_b = v_uv + refract_axis * (1.0 - u_dispersion);
    vec3 backdrop = vec3(
        texture(u_backdrop, clamp(uv_r, 0.001, 0.999)).r,
        texture(u_backdrop, clamp(uv_g, 0.001, 0.999)).g,
        texture(u_backdrop, clamp(uv_b, 0.001, 0.999)).b
    );

    float fresnel_rim = pow(clamp(edge_weight, 0.0, 1.0), 2.2);
    vec2 light_dir = normalize(u_light_direction + vec2(0.0001));
    float specular = pow(max(dot(edge_normal, light_dir), 0.0), 18.0) * fresnel_rim;
    float inner_shade = (1.0 - smoothstep(0.0, max(u_edge_width, 1.0) * 2.0, -distance_to_edge)) * 0.10;

    vec3 tinted = mix(backdrop, u_tint_color, clamp(u_tint_strength, 0.0, 1.0));
    vec3 color = tinted + vec3(0.24, 0.30, 0.40) * specular - vec3(inner_shade);
    frag_color = vec4(color, coverage);
}
