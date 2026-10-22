/**
 * LabelFactory - Creates DOM elements for map labels
 */

class LabelFactory {
    /**
     * Create simple text label
     */
    static createLabel(text, size, color) {
        const el = document.createElement('div');
        el.className = 'map-label';
        el.style.fontSize = size + 'px';
        el.style.color = CONFIG.colors[color] || color || '#fff';
        el.textContent = text;
        return el;
    }

    /**
     * Create bubble/callout label
     */
    static createBubble(text, color) {
        const el = document.createElement('div');
        el.className = 'map-bubble';
        el.textContent = text;
        const borderColor = CONFIG.colors[color] || color || '#4cd964';
        // border-left for positioned bubbles; border-bottom for subtitle mode
        el.style.borderLeftColor  = borderColor;
        el.style.borderBottomColor = borderColor;
        return el;
    }

    /**
     * Create year badge
     */
    static createYear(text, highlight) {
        const el = document.createElement('div');
        el.className = 'map-year-overlay' + (highlight ? ' highlight' : '');
        el.textContent = text;
        return el;
    }

    /**
     * Create arrow label with pointer
     */
    static createArrow(text, direction, color) {
        const el = document.createElement('div');
        el.className = 'map-arrow ' + (direction || 'right');

        const borderColor = CONFIG.colors[color] || color || '#fff';

        el.innerHTML = `<div class="map-arrow-content" style="border-color: ${borderColor}">${text}</div><div class="map-arrow-pointer" style="color: ${borderColor}"></div>`;

        return el;
    }
}