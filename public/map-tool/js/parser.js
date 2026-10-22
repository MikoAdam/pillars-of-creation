/**
 * ScriptParser - Parses animation script into commands
 */

class ScriptParser {
    parse(script) {
        const lines = script.split('\n');
        const commands = [];
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const cmd = this.parseLine(trimmed);
            if (cmd) {
                cmd.scriptLine = i;
                commands.push(cmd);
            }
        }
        return commands;
    }

    parseLine(line) {
        let match;

        // region: Name, Country, color, occupied
        if ((match = line.match(/^region:\s*(.+?),\s*(.+?),\s*(\S+)(?:,\s*(occupied))?$/i))) {
            return {
                type: 'region',
                name: match[1].trim(),
                country: match[2].trim(),
                color: match[3],
                occupied: !!match[4]
            };
        }

        // bubble: "text", color  — subtitle mode (lat/lng optional for backward compat)
        if ((match = line.match(/^bubble:\s*(?:-?[\d.]+,\s*-?[\d.]+,\s*)?"([^"]+)"(?:,\s*(\S+))?$/i))) {
            return { type: 'bubble', text: match[1], color: match[2] || 'white' };
        }

        // arrow: lat, lng, "text", direction, color
        if ((match = line.match(/^arrow:\s*(-?[\d.]+),\s*(-?[\d.]+),\s*"([^"]+)"(?:,\s*(\w+))?(?:,\s*(\w+))?$/i))) {
            return {
                type: 'arrow',
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2]),
                text: match[3],
                direction: match[4] || 'right',
                color: match[5]
            };
        }

        // year: "text", highlight
        if ((match = line.match(/^year:\s*"([^"]+)"(?:,\s*(highlight))?$/i))) {
            return {
                type: 'year',
                text: match[1],
                highlight: !!match[2]
            };
        }

        // label: lat, lng, "text", size, color
        if ((match = line.match(/^label:\s*(-?[\d.]+),\s*(-?[\d.]+),\s*"([^"]+)"(?:,\s*(\d+))?(?:,\s*(\S+))?$/i))) {
            return {
                type: 'label',
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2]),
                text: match[3],
                size: parseInt(match[4]) || 14,
                color: match[5]
            };
        }

        // legend: "Label", color
        if ((match = line.match(/^legend:\s*"([^"]+)"(?:,\s*(\S+))?$/i))) {
            return { type: 'legend', label: match[1], color: match[2] || 'blue' };
        }

        // legend: auto
        if ((match = line.match(/^legend:\s*auto$/i))) {
            return { type: 'legendAuto' };
        }

        // legend: hide
        if ((match = line.match(/^legend:\s*hide$/i))) {
            return { type: 'legendHide' };
        }

        // effect: lat, lng, effectName[, color[, size]]
        if ((match = line.match(/^effect:\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(\w+)(?:,\s*(\S+))?(?:,\s*([\d.]+))?$/i))) {
            return {
                type: 'effect',
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2]),
                effect: match[3].toLowerCase(),
                color: match[4] || 'red',
                size: parseFloat(match[5]) || 1
            };
        }

        // remove: last | arrows | effects | lines
        if ((match = line.match(/^remove:\s*(last|arrows|effects|lines)$/i))) {
            const val = match[1].toLowerCase();
            if (val === 'arrows')  return { type: 'removeArrows' };
            if (val === 'effects') return { type: 'removeEffects' };
            if (val === 'lines')   return { type: 'removeLines' };
            return { type: 'remove' };
        }

        // zoom: target
        if ((match = line.match(/^zoom:\s*(.+)$/i))) {
            return { type: 'zoom', target: match[1].trim() };
        }

        // cinematic: lat, lng, zoom, pitch, bearing
        if ((match = line.match(/^cinematic:\s*(-?[\d.]+),\s*(-?[\d.]+),\s*([\d.]+)(?:,\s*(-?[\d.]+))?(?:,\s*(-?[\d.]+))?$/i))) {
            return {
                type: 'cinematic',
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2]),
                zoom: parseFloat(match[3]),
                pitch: parseFloat(match[4]) || 30,
                bearing: parseFloat(match[5]) || 0
            };
        }

        // fly: lat, lng, zoom
        if ((match = line.match(/^fly:\s*(-?[\d.]+),\s*(-?[\d.]+),\s*([\d.]+)$/i))) {
            return {
                type: 'fly',
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2]),
                zoom: parseFloat(match[3])
            };
        }

        // wait: Ns or Nms
        if ((match = line.match(/^wait:\s*([\d.]+)(ms|s)?$/i))) {
            const value = parseFloat(match[1]);
            const unit = (match[2] || 's').toLowerCase();
            return {
                type: 'wait',
                ms: unit === 's' ? Math.round(value * 1000) : Math.round(value)
            };
        }

        // attack: From, To, color[, curve[, width]]
        // From/To can be country names or "lat lng" coordinates
        if ((match = line.match(/^attack:\s*/i))) {
            const cmd = this._parseArrowLine(line.slice(match[0].length), 'attack');
            if (cmd) return cmd;
        }

        // line: From, To, color
        if ((match = line.match(/^line:\s*/i))) {
            const cmd = this._parseArrowLine(line.slice(match[0].length), 'line');
            if (cmd) return cmd;
        }

        // clear: CountryName  — remove all highlights for features belonging to a country
        if ((match = line.match(/^clear:\s*(.+)$/i))) {
            return { type: 'clearCountry', name: match[1].trim() };
        }

        // clearRegions: CountryName  — remove only admin-1 region highlights, keep country polygon
        if ((match = line.match(/^clearRegions:\s*(.+)$/i))) {
            return { type: 'clearRegions', name: match[1].trim() };
        }

        // rename: Country, "Custom Label"[, lat, lng]  — suppress default map label, show custom text
        if ((match = line.match(/^rename:\s*(.+?),\s*"([^"]+)"(?:,\s*(-?[\d.]+),\s*(-?[\d.]+))?$/i))) {
            return {
                type: 'rename',
                country: match[1].trim(),
                label: match[2],
                lat: match[3] !== undefined ? parseFloat(match[3]) : null,
                lng: match[4] !== undefined ? parseFloat(match[4]) : null
            };
        }

        // unrename: Country  — restore the original country name label
        if ((match = line.match(/^unrename:\s*(.+?)$/i))) {
            return { type: 'unrename', country: match[1].trim() };
        }

        // country: color, animation (catch-all — must be last)
        if ((match = line.match(/^([\w\s-]+):\s*(\S+)(?:,\s*(\w+))?$/i))) {
            return {
                type: 'country',
                name: match[1].trim(),
                color: match[2],
                animation: match[3]
            };
        }

        return null;
    }

    /**
     * Parse arrow line. Supports two formats:
     * Named:      from 52.50 13.40, to 48.85 2.35, color red, curve 0.15, width 1.00, head 1.00, dur 800
     * Positional:  Germany, France, red[, 0.15[, 1[, 1[, draw]]]]
     * From/To can be country names or "lat lng" coordinates.
     */
    _parseArrowLine(rest, type) {
        const parts = rest.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length < 2) return null;

        // Detect named format by checking if first part starts with "from "
        if (parts[0].match(/^from\s+/i)) {
            return this._parseNamedArrowLine(parts, type);
        }

        // Legacy positional format
        if (parts.length < 3) return null;

        const parseEndpoint = (s) => {
            const coords = s.match(/^(-?[\d.]+)\s+(-?[\d.]+)$/);
            if (coords) {
                return { lat: parseFloat(coords[1]), lng: parseFloat(coords[2]) };
            }
            return s;
        };

        const from = parseEndpoint(parts[0]);
        const to = parseEndpoint(parts[1]);
        const color = parts[2];

        if (!color) return null;

        const cmd = { type, from, to, color };
        if (parts[3] !== undefined) cmd.curve = parseFloat(parts[3]);
        if (parts[4] !== undefined) cmd.width = parseFloat(parts[4]);
        if (parts[5] !== undefined) cmd.headSize = parseFloat(parts[5]);
        if (parts[6] !== undefined) {
            const v = parts[6].trim().toLowerCase();
            if (isNaN(v)) cmd.animation = v;
            else cmd.drawDuration = parseInt(v);
        }
        if (parts[7] !== undefined) cmd.drawDuration = parseInt(parts[7]);
        return cmd;
    }

    /**
     * Parse named-param arrow format: from X, to Y, color C, curve N, width N, head N, dur N
     */
    _parseNamedArrowLine(parts, type) {
        const cmd = { type };

        const parseEndpoint = (s) => {
            const coords = s.match(/^(-?[\d.]+)\s+(-?[\d.]+)$/);
            if (coords) return { lat: parseFloat(coords[1]), lng: parseFloat(coords[2]) };
            return s;
        };

        for (const part of parts) {
            const p = part.trim();
            let m;
            if ((m = p.match(/^from\s+(.+)$/i))) {
                cmd.from = parseEndpoint(m[1].trim());
            } else if ((m = p.match(/^to\s+(.+)$/i))) {
                cmd.to = parseEndpoint(m[1].trim());
            } else if ((m = p.match(/^color\s+(.+)$/i))) {
                cmd.color = m[1].trim();
            } else if ((m = p.match(/^curve\s+([\d.+-]+)$/i))) {
                cmd.curve = parseFloat(m[1]);
            } else if ((m = p.match(/^width\s+([\d.]+)$/i))) {
                cmd.width = parseFloat(m[1]);
            } else if ((m = p.match(/^head\s+([\d.]+)$/i))) {
                cmd.headSize = parseFloat(m[1]);
            } else if ((m = p.match(/^dur\s+(\d+)$/i))) {
                cmd.drawDuration = parseInt(m[1]);
            } else if ((m = p.match(/^anim\s+(\w+)$/i))) {
                cmd.animation = m[1].toLowerCase();
            }
        }

        if (!cmd.from || !cmd.to || !cmd.color) return null;
        return cmd;
    }
}
