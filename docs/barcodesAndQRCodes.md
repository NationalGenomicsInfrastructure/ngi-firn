# Barcode and QR code support in Firn

Firn implements both, barcode and QR code readers using a device's camera.

## Barcode

Barcodes are used in our cold storage inventory to identify our stored plates.

## Details of the implementation

The barcode reader functionality in Firn is built on top of the [ZXing ("Zebra Crossing")](https://github.com/zxing/zxing) library, which provides robust and efficient barcode scanning capabilities directly in the browser using the device's camera. The core of the implementation is a reusable Vue component that handles live video streaming, barcode detection, and overlays for visual feedback. This component is designed to be flexible, supporting a variety of 1D barcode formats as listed below. Its code can be found at `app/components/barcode/ZxingReader.vue`.

In addition to the basic barcode reader component, Firn offers a user-friendly way for barcode scanning by allowing users to scan barcodes in a modal window. This dialog component includes features such as displaying a list of detected barcodes, copy-pasting the most frequently detected code, and erasing detection history and can be found at `app/components/dialog/DialogZxingReader.vue`. The implementation of this is further modularized through a composable `app/composables/useBarcodeDetections.ts`, which encapsulates the logic for managing barcode detections, providing a clean and reactive API for use across different components.

NGI internally uses **Code_128** for plate labels.

### List of barcode formats

- **`code_128`**: Code 128 - A high-density barcode that can encode all 128 ASCII characters. Very versatile and commonly used in shipping, packaging, and logistics.

- **`ean`** / **`ean_8`**: EAN (European Article Number) - Used primarily for retail products. EAN-13 (13 digits) is the most common, EAN-8 is a shorter version for small packages.

- **`ean_5`** / **`ean_2`**: EAN-5 and EAN-2 - Supplemental barcodes used alongside main barcodes on books and magazines for price/issue information.

- **`upc`** / **`upc_e`**: UPC (Universal Product Code) - The North American equivalent of EAN, commonly seen on retail products. UPC-A is 12 digits, UPC-E is a compressed version.

- **`code_39`**: Code 39 - Can encode letters, numbers, and some special characters. Common in automotive, defense, and healthcare industries.

- **`code_39_vin`**: Code 39 VIN - Specialized for Vehicle Identification Numbers.

- **`codabar`**: Codabar - Older format used in libraries, blood banks, and logistics. Can encode numbers and a few special characters.

- **`i2of5`** / **`2of5`**: Interleaved 2 of 5 and Standard 2 of 5 - Numeric-only barcodes used in warehousing and industrial applications.

- **`code_93`**: Code 93 - Similar to Code 39 but more compact. Used by Canada Post and in logistics.

- **`code_32`**: Code 32 (Italian Pharmacode) - Used specifically for pharmaceutical products in Italy.
