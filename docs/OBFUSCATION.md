# Experimental release obfuscation

Production builds default to the `strings` profile:
- Rename internal identifiers and encode selectors, event/module names, and shader strings.
- Decode the string pool once at startup; rendering reads the decoded array directly.
- Apply stronger transforms only to main/theme/bootstrap initialization.
- PulseColorVisual additionally applies the dedicated strong premium gate profile inherited from Cover-Tweaked.

Public API property names, settings metadata, CSS, models, and third-party assets
remain compatible and are not secret. Runtime strings can still be inspected.
This is reversible obfuscation, not a security boundary or cryptographic secrecy.

To return to the previous release profile, build and sync with the environment
variable `PULSECOLOR_OBFUSCATION=light`. Development builds remain unobfuscated.
No eval, DevTools traps, console suppression, or source maps are added.

