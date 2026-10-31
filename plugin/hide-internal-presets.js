/*
 * Hide internal child presets from the UI roster.
 *
 * Why this exists: since DSH 0.2.1 a sub-agent's persona and toolset must be
 * declared as an Agent Preset (`agentPreset` on `tool-subagent`), and
 * `agent-presets` has no "hidden" concept — its roster method returns every
 * declaration, so the practice agent would show up in the mode picker as if it
 * were a mode a person could choose.
 *
 * The roster call is dispatched dynamically on the live service instance
 * (`Reflect.get(receiver, method)` in the API gateway), so wrapping that one
 * method on the instance filters what the Web UI lists while leaving the
 * registry untouched: `resolve` / `mount` / `compositionInventory` still see the
 * child preset, so delegation keeps working.
 *
 * A broken internal preset is deliberately NOT hidden: the red "load failed"
 * card under Settings → Modes is the only UI surface that shows the real error,
 * and a hidden child would otherwise fail silently (visible only in the Host
 * log). Hiding is for healthy plumbing only.
 *
 * If DSH renames or drops the method, this plugin does nothing — the child
 * preset simply reappears in the picker. It never throws for that reason.
 */

/** Presets that exist only to back a delegation tool. */
const INTERNAL_PRESETS = new Set([
  'study-practice',
]);

/** The registry's UI-facing roster method. */
const ROSTER_METHOD = 'remoteExportList';

export default class HideInternalPresets {
  static inject = ['agentPresets'];

  constructor(ctx) {
    const registry = ctx.agentPresets;
    const original = registry?.[ROSTER_METHOD];
    if (typeof original !== 'function') return;

    const bound = original.bind(registry);
    const filtered = async (...args) => {
      const roster = await bound(...args);
      if (roster === null || typeof roster !== 'object' || !Array.isArray(roster.presets)) {
        return roster;
      }
      return {
        ...roster,
        presets: roster.presets.filter((preset) => {
          if (!INTERNAL_PRESETS.has(preset?.id)) return true;
          // Keep a broken internal preset visible: its red load-failure card is
          // the only UI surface that carries the real error text.
          return typeof preset.broken === 'string' && preset.broken !== '';
        }),
      };
    };

    try {
      Object.defineProperty(registry, ROSTER_METHOD, {
        configurable: true,
        writable: true,
        value: filtered,
      });
    } catch {
      // A non-extensible service is a DSH internal change, not a user error.
    }
  }
}
