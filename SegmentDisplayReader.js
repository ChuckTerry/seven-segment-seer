import { SegmentDisplayReaderConfiguration } from './SegmentDisplayReaderConfiguration.js';

/**
 * @typedef {Object} Pixel
 * @property {number} r - Red component
 * @property {number} g - Green component
 * @property {number} b - Blue component
 */

/** @typedef {Array<(0|1)>} Bitmask */
/** @typedef {Array<Bitmask>} Bitmask2d */

/** @typedef {[number, number]} Coordinate */
/** @typedef {Array<Coordinate>} CoordinateArray */
/** @typedef {CoordinateArray} CA */

/** @typedef {[CA, CA, CA, CA, CA, CA, CA, CA]} SevenSegmentDisplay */
/** @typedef {SevenSegmentDisplay} SSD */

/** @typedef {[SSD, SSD, SSD, SSD, SSD, SSD]} OutputDisplays */

/**
 * @typedef {HTMLVideoElement|VideoFrame|SVGImageElement|HTMLCanvasElement|OffscreenCanvas|HTMLImageElement|ImageBitmap} StreamSource
 */

/** 
 * @typedef {Object} BoundingRect
 * @property {number} x - The x coordinate of the rectangle's top-left corner
 * @property {number} y - The y coordinate of the rectangle's top-left corner
 * @property {number} width - The width of the rectangle
 * @property {number} height - The height of the rectangle
 */

/**
 * @typedef {Object} HoleComponent
 * @property {CoordinateArray} pixels - The pixels that make up this hole
 * @property {number?} centerX - The x coordinate of the hole's center
 * @property {number?} centerY - The y coordinate of the hole's center
 * @property {BoundingRect?} rect - The bounding rectangle of the hole
 */

/**
 * @callback BitmaskMatchFunction
 * @param {any} value - The value of the pixel
 * @param {Coordinate} coord - The [x, y] coordinate of the pixel
 * @param {Bitmask2d} matrix - The entire bitmask matrix
 * @returns {boolean} - Whether the pixel matches the criteria
 */

/**
 * Creates a 2D array filled with a specified value.
 * 
 * @template T
 * @param {number} height The length of the outer array
 * @param {number} width The length of the interior arrays
 * @param {T} fillValue The value to fill the array with
 * @returns {Array<Array<T>>}
 */
function create2dArray(height, width, fillValue) {
    return Array.from({ length: height }, () => {
        return new Array(width).fill(fillValue);
    });
}

const ERROR_STRINGS_US = {
    noCanvas: 'SegmentDisplayReader constructor requires an HTML canvas element as the second parameter.',
    badCanvas: 'SegmentDisplayReader constructor called with an invalid HTMLCanvasElement.',
    badContext: 'Unable to get 2D context from provided canvas element.',
    badVideoElement: 'Video element for webcam feed not found in document.',
    noVideoElement: 'SegmentDisplayReader constructor requires a video element as the first parameter.'
};

/**
 * @class SegmentDisplayReader
 * @extends EventTarget
 * @description A class that reads 7-segment displays from a video feed and converts them to characters.
 * 
 * @event SegmentDisplayReader#change
 * @property {Object} detail - The event details
 * @property {string} detail.value - The newly detected display value (6 characters)
 * 
 * @event SegmentDisplayReader#output
 * @property {Object} detail - The event details
 * @property {string} detail.value - The confirmed display value after 4 consistent readings
 */
export class SegmentDisplayReader extends EventTarget {
    /**
     * Mapping of 7-segment bitmask to characters.
     * @type {Object<number, string>}
     */
    static charMap = {
        0: ' ',
        2: '\'',
        4: 'i',
        6: '1',
        7: '7',
        8: '_',
        16: ',',
        28: 'u',
        30: 'J',
        32: '`',
        34: '"',
        48: 'I',
        56: 'L',
        57: 'C',
        61: 'G',
        62: 'U',
        63: '0',
        64: '-',
        79: '3',
        80: 'r',
        83: '?',
        84: 'n',
        88: 'c',
        91: '2',
        92: 'o',
        94: 'd',
        95: 'a',
        102: '4',
        103: 'q',
        109: '5',
        110: 'Y',
        111: '9',
        113: 'F',
        115: 'P',
        116: 'h',
        118: 'H',
        119: 'A',
        120: 't',
        121: 'E',
        123: 'e',
        124: 'b',
        125: '6',
        127: '8'
    };

    /**
     * Creates a new SegmentDisplayReader instance.
     * 
     * @param {StreamSource} source The video source element
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(source, canvas = document.createElement('canvas'), configuration = new SegmentDisplayReaderConfiguration()) {
        super();

        if (canvas instanceof HTMLCanvasElement === false) {
            if (canvas === null || canvas === undefined) {
                throw new Error(ERROR_STRINGS_US.noCanvas);
            } else {
                throw new Error(ERROR_STRINGS_US.badCanvas);
            }
        }

        /** @type {ImageData[]} */
        this.calibrationImages = [];
        /** @type {string|null} */
        this.lastDisplay = null;
        this.calibrated = false;
        this.showDebugMask = false;
        this.consistentOutputCount = 0;

        if (!(configuration instanceof SegmentDisplayReaderConfiguration)) {
            console.warn('Invalid configuration object provided, using default configuration.');
            configuration = new SegmentDisplayReaderConfiguration();
        }
        this.debugMaskColors = configuration.debugMaskColors;
        this.grayThreshold = configuration.grayThreshold;
        this.floodFillDpThreshold = configuration.decimalPointFloodFillThreshold;
        this.rotate180 = configuration.rotate180;

        // Canvas, Context, & initial ImageData
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        if (this.context === null) {
            throw new Error(ERROR_STRINGS_US.badContext);
        }

        // Video Element & Webcam Setup
        this.source = source;
        if (this.source instanceof HTMLVideoElement) {
            navigator.mediaDevices.getUserMedia({
                audio: false, video: true
            }).then((stream) => {
                /** @type {HTMLVideoElement} */ (this.source).srcObject = stream;
            }).catch((error) => {
                console.error('Error accessing webcam:', error);
            });
        } else if (this.source instanceof VideoFrame
            || this.source instanceof SVGImageElement
            || this.source instanceof HTMLCanvasElement
            || this.source instanceof OffscreenCanvas
            || this.source instanceof HTMLImageElement
            || this.source instanceof ImageBitmap
        ) {
            // Will handle support for some of these later
            // SVG will probably be first since that's what
            // The ET-3400 Simulator uses
        } else if (this.source === null || this.source === undefined) {
            throw new Error(ERROR_STRINGS_US.noVideoElement);
        } else {
            throw new Error(ERROR_STRINGS_US.badVideoElement);
        }


        /** @type {OutputDisplays} */
        this.segmentSamples = [
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []]
        ];

        this.grayArray = create2dArray(this.canvas.height, this.canvas.width, 0);
        this.litReference = this.createPixelArray(0);
        this.unlitReference = this.createPixelArray(0);
        this.backgroundMask = this.createPixelArray(0);

        this.worker = new Worker('./timingWorker.js');
        this.worker.addEventListener('message', (event) => {
            if (this.calibrated === false) {
                this.worker.postMessage('readStop');
            } else if (event.data === 'read') {
                this.readDisplays();
            }
        });
        
        window.addEventListener('beforeunload', () => {
            this.worker.terminate();
        })
    }

    /**
     * Calibrates the segment display reader by capturing reference images.
     * 
     * @fires SegmentDisplayReader#calibration
     */
    attemptCalibration() {
        const success = this.determineLocations();
        if (success) {
            this.worker.postMessage('readStart');
            this.calibrated = true;
        }
        return success;
    }

    /**
     * 
     * @param {Bitmask2d} bitmask
     * @returns {CoordinateArray}
     */
    bitmaskToPixelArray(bitmask) {
        const maskCoordinates = bitmask.map((row, y) => {
            return row.map((value, x) => {
                return value === 1 ? [x, y] : null;
            });
        }).flat().filter((value) => {
            return value !== null;
        });
        return /** @type {CoordinateArray} */(maskCoordinates);
    }

    /**
     * Captures a calibration image for later analysis.
     * 
     * @param {boolean} [autoAttemptCalibration=true] Whether to automatically attempt calibration after capturing two images
     */
    captureCalibrationImage(autoAttemptCalibration = true) {
        const initialLength = this.calibrationImages.length;
        if (initialLength === 2) {
            this.resetCalibration();
            this.calibrationImages.push(this.captureImageData());
        } else if (initialLength < 2) {
            this.calibrationImages.push(this.captureImageData());
            if (this.calibrationImages.length === 2 && autoAttemptCalibration) {
                this.attemptCalibration();
            }
        }
    }

    /**
     * Captures the current image data from the video element.
     * 
     * @returns {ImageData}
     */
    captureImageData() {
        const { canvas, context, source: source } = this;
        const { width, height } = canvas;
        context.save();
        if (this.rotate180) {
            const halfWidth = width / 2;
            const halfHeight = height / 2;
            context.translate(halfWidth, halfHeight);
            context.rotate(Math.PI);
            context.drawImage(source, -halfWidth, -halfHeight, width, height);
        } else {
            context.drawImage(source, 0, 0, width, height);
        }
        context.restore();
        return context.getImageData(0, 0, width, height);
    }

    /**
     * 
     * @param {any} fillValue 
     * @returns 
     */
    createPixelArray(fillValue = 0) {
        return create2dArray(this.canvas.height, this.canvas.width, fillValue);
    }

    /**
     * Applies a debug mask overlay to visualize segment detection.
     * 
     * @param {ImageData} currentData The current image data
     */
    debugMask(currentData, ambientOffset = 0) {
        const { width } = this.canvas;
        const colors = this.debugMaskColors;

        for (let digit = 0; digit < 6; digit++) {
            const digitSegments = this.segmentSamples[digit];
            for (let segment = 0; segment < 8; segment++) {
                /** @type {CoordinateArray} */
                const pixels = digitSegments[segment];
                const length = pixels.length;
                for (let index = 0; index < length; index++) {
                    const [x, y] = pixels[index];
                    const currentGray = this.getPixelGrayValue(currentData, x, y);
                    const isOn = this.isPixelLit(currentGray, x, y, ambientOffset);
                    const { r, g, b } = colors[digit][isOn ? 1 : 0];
                    const pixelIndex = (y * width + x) * 4;
                    currentData.data[pixelIndex] = r;
                    currentData.data[pixelIndex + 1] = g;
                    currentData.data[pixelIndex + 2] = b;
                    currentData.data[pixelIndex + 3] = 255;
                }
            }
        }
        this.context.putImageData(currentData, 0, 0);
    }

    /**
     * Attempts to determine the locations of segments by analyzing calibration images.
     * 
     * @returns {boolean}
     */
    determineLocations() {
        const { canvas, grayThreshold } = this;
        const { height, width } = canvas;

        // Reset calibration references to match the current canvas size
        this.grayArray = this.createPixelArray(0);
        this.litReference = this.createPixelArray(0);
        this.unlitReference = this.createPixelArray(0);
        this.backgroundMask = this.createPixelArray(0);

        // Pick which calibration frame is lit vs unlit based on total brightness so order doesn't matter.
        const [litImage, unlitImage] = this.getOrderedCalibrationImages();

        /** @type {Bitmask2d} */
        const detectablePixelArray = this.createPixelArray(0);

        // For every pixel, compare its brightness in the "all on" vs "all off" images
        // If its brightness is over a certain threshold, we mark it as "detectable"
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const onGray = this.getPixelGrayValue(litImage, x, y);
                const offGray = this.getPixelGrayValue(unlitImage, x, y);
                const difference = Math.abs(onGray - offGray);
                this.litReference[y][x] = onGray;
                this.unlitReference[y][x] = offGray;
                this.grayArray[y][x] = difference;
                if (difference > grayThreshold) {
                    detectablePixelArray[y][x] = 1;
                }
            }
        }

        // The way the "background" pixels work is that we mark the edges of the
        // image as background, then we flood fill from there to find all connected pixels that
        // are not detectable.  This will give us a bitmask of all pixels that are outside the
        // digits and leave us with only the dark pixels that are "inside" the digits (the "holes").
        const visited = new Set();
        /** @type {HoleComponent[]} */
        const holeComponents = [];
        /** @type {BitmaskMatchFunction} */
        const backgroundMatchFunction = (_, [x, y]) => {
            return detectablePixelArray[y][x] === 0;
        };
        const backgroundPixels = this.generateBitmask(detectablePixelArray, backgroundMatchFunction);
        this.backgroundMask = backgroundPixels;

        // Check every pixel in our image
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // We're looking for pixels that are neither detectable nor background
                if (detectablePixelArray[y][x] === 0 && !backgroundPixels[y][x] && !visited.has(`${x},${y}`)) {
                    // Found a hole, map out its shape
                    const component = this.findHoleComponent(detectablePixelArray, backgroundPixels, visited, [x, y]);
                    // Filter out noise - 10 is an arbitrary threshold
                    if (component.pixels.length > 10) {
                        holeComponents.push(component);
                    }
                }
            }
        }

        // If we didn't find the right number of holes, calibration failed, reset everything
        if (holeComponents.length !== 12) {
            alert('Not enough holes detected. Please ensure all segments are visible and in focus, then try calibrating again.');
            this.resetCalibration();
            return false;
        }

        // Find the center and bounding rectangle for each hole
        holeComponents.forEach((component) => {
            const pixelCount = component.pixels.length;
            let sumX = 0;
            let sumY = 0;
            let leftX = Infinity;
            let topY = Infinity;
            let rightX = 0;
            let bottomY = 0;

            for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
                const [x, y] = component.pixels[pixelIndex];
                sumX += x;
                sumY += y;
                leftX = Math.min(leftX, x);
                topY = Math.min(topY, y);
                rightX = Math.max(rightX, x);
                bottomY = Math.max(bottomY, y);
            }

            // Calculate the center by finding the average position
            component.centerX = sumX / pixelCount;
            component.centerY = sumY / pixelCount;
            component.rect = {
                x: leftX,
                y: topY,
                width: rightX - leftX + 1,
                height: bottomY - topY + 1
            };
        });

        // Use k-means to group holes into 6 clusters based on their horizontal position.
        const k = 6;
        const componentCount = holeComponents.length;

        holeComponents.sort((a, b) => {
            return (a.centerX ?? 0) - (b.centerX ?? 0);
        });

        let centers = [];
        for (let index = 0; index < k; index++) {
            centers[index] = holeComponents[Math.floor(index * componentCount / k)].centerX;
        }

        let assignments = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let changed = true;
        let iteration = 0;

        while (changed && iteration < 10) {
            changed = false;
            iteration++;

            // Assign each hole to the nearest group center
            for (let j = 0; j < componentCount; j++) {
                let minDist = Infinity;
                let bestK = 0;

                // Check distance to each group center
                for (let ki = 0; ki < k; ki++) {
                    const centerX = holeComponents[j].centerX;
                    const center = centers[ki];
                    if (centerX === null || center === null) {
                        continue;
                    }
                    const dist = Math.abs(centerX - center);
                    if (dist < minDist) {
                        minDist = dist;
                        bestK = ki;
                    }
                }

                // Switch to the new group if it's a better fit
                if (assignments[j] !== bestK) {
                    changed = true;
                    assignments[j] = bestK;
                }
            }

            // Next we'll update each group's center based on its members
            const sums = [0, 0, 0, 0, 0, 0];
            const counts = [0, 0, 0, 0, 0, 0];

            // Add up all positions in each group
            for (let index = 0; index < componentCount; index++) {
                const ki = assignments[index];
                const centerX = holeComponents[index].centerX;
                if (centerX !== null) {
                    sums[ki] += centerX;
                    counts[ki]++;
                }
            }

            // Calculate new center for each group (average position)
            for (let index = 0; index < k; index++) {
                const count = counts[index];
                if (count > 0) {
                    centers[index] = sums[index] / count;
                }
            }
        }

        /** 
         * 6 empty arrays to hold the holes for each digit.
         * @type {HoleComponent[][]}
         */
        const groups = [[], [], [], [], [], []];

        // Put each hole into its assigned group
        for (let index = 0; index < componentCount; index++) {
            groups[assignments[index]].push(holeComponents[index]);
        }

        // Add AvgCx to each group for sorting
        const groupObjects = groups.map((group, index) => {
            return {
                group,
                avgCx: centers[index]
            };
        }).sort((a, b) => {
            return (a.avgCx ?? 0) - (b.avgCx ?? 0);
        });

        // Use the holes to find segment pixels for each of the six digits
        groupObjects.forEach(({ group }, digit) => {

            // Each digit should have exactly 2 holes (top and bottom)
            if (group.length !== 2) {
                console.warn(`Digit ${digit} has ${group.length} holes, expected 2.`);
                return;
            }

            // Determine upper and lower holes using vertical position
            const [upper, lower] = group.sort((a, b) => {
                return (a.centerY ?? 0) - (b.centerY ?? 0);
            });

            // Get the segment storage for this digit
            /** @type {Array<CoordinateArray>} */
            const segments = this.segmentSamples[digit];

            /**
             * Adds a pixel to the specified segment if it's a detectable pixel.
             * 
             * @param {number} index Segment index (0-6)
             * @param {number} x 
             * @param {number} y 
             */
            const addToSeg = (index, x, y) => {
                if (x > -1
                    && x < width
                    && y > -1
                    && y < height
                    && detectablePixelArray[y][x] === 1
                ) {
                    segments[index].push([x, y]);
                }
            };

            // Distance to search for vertical & horizontal segments
            const reach = 7;
            const horizontalReach = 6;

            // Sample segments around the upper and lower holes
            upper.pixels.forEach(([x, y]) => {
                // Segment A
                addToSeg(0, x, y - horizontalReach);
                // Segment F
                addToSeg(5, x - reach, y);
                // Segment B
                addToSeg(1, x + reach, y);
                // Segment G
                addToSeg(6, x, y + horizontalReach);
            });

            lower.pixels.forEach(([x, y]) => {
                // No need to sample G again
                // Segment E
                addToSeg(4, x - reach, y);
                // Segment C
                addToSeg(2, x + reach, y);
                // Segment D
                addToSeg(3, x, y + horizontalReach);
            });

            // Find the decimal point by locating the rightmost and bottommost pixels
            // from the segment samples, then finding their intersection and flood filling from there
            let rightmostX = -1;
            let bottommostY = -1;

            // Go through all segments (0-6) to find rightmost and bottommost pixels
            for (let segmentIndex = 0; segmentIndex < 7; segmentIndex++) {
                const segmentPixels = segments[segmentIndex];
                const segmentPixelCount = segmentPixels.length;
                for (let pixelIndex = 0; pixelIndex < segmentPixelCount; pixelIndex++) {
                    const [px, py] = segmentPixels[pixelIndex];
                    if (px > rightmostX) {
                        rightmostX = px;
                    }
                    if (py > bottommostY) {
                        bottommostY = py;
                    }
                }
            }

            // Find the intersection point
            if (rightmostX !== -1 && bottommostY !== -1) {
                // The intersection is where a line going down from rightmost meets a line going right from bottommost
                const dpPixels = this.floodFillDecimalPoint(rightmostX + 2, bottommostY + 2);
                segments[7] = dpPixels;
            }
        });
        return true;
    }

    /**
     * Estimate a consistent brightness offset between the calibration images and the current frame.
     * Samples background pixels so we can normalize frames shot in brighter or darker conditions.
     * 
     * @param {ImageData} currentData
     * @returns {number}
     */
    estimateAmbientOffset(currentData) {
        if (!this.backgroundMask || !this.backgroundMask.length) {
            return 0;
        }

        const { width, height } = this.canvas;
        // Keep the sampling light so it can run each frame without impacting performance.
        const stepY = Math.max(1, Math.floor(height / 40));
        const stepX = Math.max(1, Math.floor(width / 40));
        let sum = 0;
        let count = 0;

        for (let y = 0; y < height; y += stepY) {
            const maskRow = this.backgroundMask[y];
            const unlitRow = this.unlitReference[y];
            if (!maskRow || !unlitRow) {
                continue;
            }
            for (let x = 0; x < width; x += stepX) {
                if (maskRow[x]) {
                    const pixelGray = this.getPixelGrayValue(currentData, x, y);
                    sum += pixelGray - unlitRow[x];
                    count++;
                }
            }
        }

        if (count === 0) {
            return 0;
        }

        return sum / count;
    }

    /**
     * Finds a connected hole component using flood fill.
     * 
     * @param {Bitmask2d} pixelArray 
     * @param {Bitmask2d} background 
     * @param {Set<string>} visited 
     * @param {Coordinate} startCoordinate
     * @returns {HoleComponent}
     */
    findHoleComponent(pixelArray, background, visited, startCoordinate) {
        /** @type {BitmaskMatchFunction} */
        const holeMatchFunction = (_, [x, y]) => {
            const key = `${x},${y}`;
            if (visited.has(key)) {
                return false;
            }
            visited.add(key);
            return pixelArray[y][x] === 0 && !background[y][x];
        };
        const bitmask = this.generateBitmask(pixelArray, holeMatchFunction, undefined, [startCoordinate]);
        return {
            pixels: this.bitmaskToPixelArray(bitmask),
            centerX: null,
            centerY: null,
            rect: null
        };
    }

    /**
     * Flood fill to find decimal point pixels
     * 
     * @param {number} startX - Starting x coordinate
     * @param {number} startY - Starting y coordinate
     * @returns {CoordinateArray} Array of [x, y] coordinates for decimal point pixels
     */
    floodFillDecimalPoint(startX, startY) {
        /** @param {any} value */
        const bitmaskTestFunction = (value) => {
            return value > this.floodFillDpThreshold;
        };

        const mask = this.generateBitmask(this.grayArray, bitmaskTestFunction, undefined, [[startX, startY]]);
        const maskedCoordinates = this.bitmaskToPixelArray(mask);

        // Sometimes, especially when camera lens is blurry, the dp pixels bleed over to the other segments and end up
        // tracing around their edges.  To prevent this, we'll only keep pixels that are very close to the starting point.
        const sanitizedMaskCoordinates = maskedCoordinates.filter(([x, y]) => {
            return x > startX - 6
                && x < startX + 6
                && y > startY - 6
                && y < startY + 6;
        });
        return sanitizedMaskCoordinates;
    }

    /**
     * Flood fill over a 2D matrix with a predicate.
     * @template T
     * @param {Array<Array<T>>} testArray 2D source matrix
     * @param {(value: T, coord: Coordinate, matrix: Array<Array<T>>) => boolean} testFunction Predicate deciding whether to include a cell
     * @param {Bitmask2d} [result] Optional output matrix
     * @param {CoordinateArray} [queue] Initial queue of coordinates
     * @returns {Bitmask2d}
     */
    generateBitmask(testArray, testFunction, result, queue = []) {
        if (!testFunction) {
            return Array.from(testArray.map((row) => {
                return row.map((value) => {
                    return !!value ? 1 : 0;
                });
            }));
        }

        if (result === undefined || !Array.isArray(result)) {
            result = this.createPixelArray(0);
        }

        if (queue.length === 0) {
            queue.push([0, 0]);
        }

        const visited = new Set();
        const directions = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0], [1, 0],
            [-1, 1], [0, 1], [1, 1]
        ];

        while (queue.length) {
            const next = queue.shift();

            if (!next) {
                break;
            }

            const [x, y] = next;

            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                const key = `${nx},${ny}`;
                const row = testArray[ny];
                if (!visited.has(key) && row) {
                    visited.add(key);
                    if (testFunction(row[nx], [nx, ny], testArray)) {
                        result[ny][nx] = 1;
                        queue.push([nx, ny]);
                    }
                }
            }
        }
        return result;
    }

    /**
     * Returns the lit/unlit images in correct order by comparing overall brightness.
     * 
     * @returns {[ImageData, ImageData]}
     */
    getOrderedCalibrationImages() {
        const [imageA, imageB] = this.calibrationImages;
        if (!imageA || !imageB) {
            return [imageA, imageB];
        }
        const aData = imageA.data;
        const bData = imageB.data;
        const length = aData.length;
        let sumA = 0;
        let sumB = 0;
        for (let index = 0; index < length; index += 4) {
            sumA += aData[index] + aData[index + 1] + aData[index + 2];
            sumB += bData[index] + bData[index + 1] + bData[index + 2];
        }
        return sumA > sumB
            ? [imageA, imageB]
            : [imageB, imageA];
    }

    /**
     * Calculates the grayscale value of the pixel at the specified coordinates from the image data.
     * 
     * @param {ImageData} pixelGrid 
     * @param {number} x 
     * @param {number} y 
     * @returns {number}
     */
    getPixelGrayValue({ data }, x, y) {
        const { width } = this.canvas;
        const index = (y * width + x) * 4;
        const gray = (data[index] + data[index + 1] + data[index + 2]) / 3;
        return gray;
    }

    /**
     * Determines if a pixel is closer to the lit or unlit calibration sample, normalized for brightness shifts.
     * 
     * @param {number} pixelGray Current grayscale value
     * @param {number} x X coordinate
     * @param {number} y Y coordinate
     * @param {number} [ambientOffset=0] Adjustment to account for ambient light change
     * @returns {boolean}
     */
    isPixelLit(pixelGray, x, y, ambientOffset = 0) {
        const litRow = this.litReference[y];
        const unlitRow = this.unlitReference[y];

        if (!litRow || !unlitRow) {
            const fallbackRow = this.grayArray[y];
            return pixelGray > (fallbackRow ? fallbackRow[x] : 0);
        }

        const litGray = litRow[x];
        const unlitGray = unlitRow[x];
        const adjustedGray = pixelGray - ambientOffset;

        const range = Math.max(Math.abs(litGray - unlitGray), 1);
        const distanceToLit = Math.abs(adjustedGray - litGray) / range;
        const distanceToUnlit = Math.abs(adjustedGray - unlitGray) / range;

        return distanceToLit <= distanceToUnlit;
    }

    /**
     * Reads the current display values from the video feed.
     * 
     * @fires SegmentDisplayReader#change
     * @fires SegmentDisplayReader#output
     */
    readDisplays() {
        const currentData = this.captureImageData();
        const ambientOffset = this.estimateAmbientOffset(currentData);
        let result = '';
        for (let digit = 0; digit < 6; digit++) {
            const digitSegments = this.segmentSamples[digit];
            let bitmask = 0;
            let lightDecimalPoint = false;

            for (let segment = 0; segment < 8; segment++) {
                /** @type {CoordinateArray} */
                const pixels = digitSegments[segment];
                const pixelCount = pixels.length;
                let toLight = Math.floor(pixelCount * 0.5);
                for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
                    const [x, y] = pixels[pixelIndex];
                    const pixelGray = this.getPixelGrayValue(currentData, x, y);
                    if (this.isPixelLit(pixelGray, x, y, ambientOffset)) {
                        if (--toLight === 0) {
                            if (segment === 7) {
                                lightDecimalPoint = true;
                            } else {
                                bitmask += (1 << segment);
                            }
                            break;
                        }
                    }
                }
            }
            result += SegmentDisplayReader.charMap[bitmask] || '􏿾';
            if (lightDecimalPoint) {
                result += '.';
            }
        }

        // Correct for Stack Pointer & Index Register notation
        if (result[2] === '.') {
            if (result.startsWith('5P')) {
                // Should be 'SP' not '5P'
                result = `S${result.slice(1)}`;
            } else if (result.startsWith('1n')) {
                // Should be 'In' not '1n'
                result = `I${result.slice(1)}`;
            }
        }

        if (this.lastDisplay !== result) {
            const event = new CustomEvent('change', { detail: { value: result } });
            this.dispatchEvent(event);
            this.consistentOutputCount = 0;
            this.lastDisplay = result;
        } else {
            if (this.consistentOutputCount++ === 3) {
                const event = new CustomEvent('output', { detail: { value: result } });
                this.dispatchEvent(event);
            }
        }

        if (this.showDebugMask) {
            this.debugMask(currentData, ambientOffset);
        }
    }

    /**
     * Compares segment pixels to current image data to improve accuracy over time.
     */
    refine() {
        const currentData = this.captureImageData();
        const ambientOffset = this.estimateAmbientOffset(currentData);
        for (let digit = 0; digit < 6; digit++) {
            const digitSegments = this.segmentSamples[digit];
            for (let segment = 0; segment < 8; segment++) {
                const litPixels = [];
                const offPixels = [];
                /** @type {CoordinateArray} */
                const pixels = digitSegments[segment];
                const pixelCount = pixels.length;
                for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
                    const [x, y] = pixels[pixelIndex];
                    const pixelGray = this.getPixelGrayValue(currentData, x, y);
                    if (this.isPixelLit(pixelGray, x, y, ambientOffset)) {
                        litPixels.push([x, y]);
                    } else {
                        offPixels.push([x, y]);
                    }
                }
                const highLimit = Math.floor(pixelCount * 0.7);
                if (litPixels.length > highLimit) {
                    digitSegments[segment] = /** @type {CoordinateArray} */ (litPixels);
                } else if (offPixels.length > highLimit) {
                    digitSegments[segment] = /** @type {CoordinateArray} */ (offPixels);
                }
            }
        }
    }

    /**
     * Resets the calibration state.
     */
    resetCalibration() {
        this.worker.postMessage('readStop');
        this.backgroundMask = this.createPixelArray(0);
        this.calibrated = false;
        this.calibrationImages.length = 0;
        this.consistentOutputCount = 0;
        this.grayArray = this.createPixelArray(0);
        this.lastDisplay = null;
        this.litReference = this.createPixelArray(0);
        this.segmentSamples = [
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []],
            [[], [], [], [], [], [], [], []]
        ];
        this.unlitReference = this.createPixelArray(0);
    }
}
