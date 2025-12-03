/**
 * @typedef {Object} Pixel
 * @property {number} r - Red component
 * @property {number} g - Green component
 * @property {number} b - Blue component
 */

export class SegmentDisplayReaderConfiguration {
    #debugMaskColors;
    #decimalPointFloodFillThreshold;
    #grayThreshold;
    #rotate180;

    constructor() {
        /**
         * The minimum required difference in gray value to consider a pixel part
         * of the decimal point during flood fill. pixelGrayValue = (r + g + b) / 3
         * @type {number} 
         */
        this.#decimalPointFloodFillThreshold = 40;
        /**
         * The minimum required difference in gray value to consider a pixel part
         * of a segment. pixelGrayValue = (r + g + b) / 3
         * @type {number} 
         */
        this.#grayThreshold = 90;

        /**
         * Whether to rotate the video feed 180 degrees.
         * @type {boolean}
         */
        this.#rotate180 = true;

        /** @type {Array<Array<Pixel>>} */
        this.#debugMaskColors = [[
            { r: 82, g: 4, b: 10 },
            { r: 233, g: 26, b: 33 },
        ], [
            { r: 91, g: 38, b: 18 },
            { r: 255, g: 136, b: 42 },
        ], [
            { r: 82, g: 67, b: 0 },
            { r: 255, g: 242, b: 0 },
        ], [
            { r: 12, g: 71, b: 30 },
            { r: 32, g: 200, b: 72 },
        ], [
            { r: 0, g: 42, b: 79 },
            { r: 0, g: 162, b: 232 },
        ], [
            { r: 61, g: 12, b: 61 },
            { r: 143, g: 56, b: 144 },
        ]];
    }

    get debugMaskColors() {
        return this.#debugMaskColors;
    }

    set debugMaskColors(value) {
        this.#debugMaskColors = value;
    }

    get decimalPointFloodFillThreshold() {
        return this.#decimalPointFloodFillThreshold;
    }

    set decimalPointFloodFillThreshold(value) {
        if (!isNaN(value) && value > 0 && value < 255) {
            this.#decimalPointFloodFillThreshold = value;
        }
    }

    get grayThreshold() {
        return this.#grayThreshold;
    }

    set grayThreshold(value) {
        if (!isNaN(value) && value > 0 && value < 255) {
            this.#grayThreshold = value;
        }
    }

    get rotate180() {
        return this.#rotate180;
    }

    set rotate180(value) {
        if (typeof value === 'boolean') {
            this.#rotate180 = value;
        }
    }
}
