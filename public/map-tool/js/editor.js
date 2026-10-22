/**
 * Editor - Text editor operations
 */

class Editor {
    constructor(elementId) {
        this.element = document.getElementById(elementId);
    }

    getValue() {
        return this.element.value;
    }

    setValue(value) {
        this.element.value = value;
    }

    insert(text) {
        const current = this.element.value.trim();
        this.element.value = current + (current ? '\n' : '') + text;
        this.element.scrollTop = this.element.scrollHeight;
        // Return the line index of the inserted line
        return this.element.value.split('\n').length - 1;
    }

    /**
     * Update an existing attack/line command in the script by its line index.
     * If lineIndex is -1, falls back to updating the last matching attack/line line.
     */
    updateArrowLine(lineIndex, newLine) {
        const lines = this.element.value.split('\n');
        if (lineIndex >= 0 && lineIndex < lines.length) {
            lines[lineIndex] = newLine;
        } else {
            // Fallback: find last attack/line line
            for (let i = lines.length - 1; i >= 0; i--) {
                if (lines[i].trim().startsWith('attack:') || lines[i].trim().startsWith('line:')) {
                    lines[i] = newLine;
                    break;
                }
            }
        }
        this.element.value = lines.join('\n');
    }

    /**
     * Remove a line from the script by index.
     */
    removeLine(lineIndex) {
        const lines = this.element.value.split('\n');
        if (lineIndex >= 0 && lineIndex < lines.length) {
            lines.splice(lineIndex, 1);
            this.element.value = lines.join('\n');
        }
    }

    /**
     * Find the script line index for an attack/line matching from/to names.
     */
    findArrowLine(fromName, toName) {
        const lines = this.element.value.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i].trim().toLowerCase();
            if (!l.startsWith('attack:') && !l.startsWith('line:')) continue;
            const fn = (fromName || '').toLowerCase();
            const tn = (toName || '').toLowerCase();
            if (fn && tn && l.includes(fn) && l.includes(tn)) return i;
        }
        return -1;
    }

    clear() {
        this.element.value = '';
    }

    focus() {
        this.element.focus();
    }
}