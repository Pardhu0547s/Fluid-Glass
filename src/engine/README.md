# Fluid Glass optical engine prototype

`shaders/glass.frag` is an early GLSL prototype for rounded-edge backdrop
refraction, restrained RGB dispersion, a Fresnel-like rim and a soft inner edge.
It expects the host renderer to provide the live backdrop texture and geometry
uniforms. It is intentionally excluded from the GNOME extension build for now.

The alpha extension uses GNOME's native `Shell.BlurEffect` for the top panel.
Do not copy this shader into a running compositor without a tested texture source,
coordinate mapping, premultiplied-alpha contract, scale handling and frame-time
measurements. A standalone OpenGL test harness is the next step.
