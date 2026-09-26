# Barcode and QR code support in Firn

Firn implements both, barcode and QR code readers using a device's camera.

## Barcode

Barcodes are used in our cold storage inventory to identify our stored plates.

## Details of the implementation

The barcode reader functionality in Firn is built on top of the [ZXing ("Zebra Crossing")](https://github.com/zxing/zxing) library, which provides robust and efficient barcode scanning capabilities directly in the browser using the device's camera. The core of the implementation is a reusable Vue component that handles live video streaming, barcode detection, and overlays for visual feedback. This component is designed to be flexible, supporting a variety of 1D barcode formats as listed below. Its code can be found at `app/components/barcode/ZxingReader.vue`.

In addition to the basic barcode reader component, Firn offers a user-friendly way for barcode scanning by allowing users to scan barcodes in a modal window. This dialog component includes features such as displaying a list of detected barcodes, copy-pasting the most frequently detected code, and erasing detection history and can be found at `app/components/dialog/DialogZxingReader.vue`. The implementation of this is further modularized through a composable `app/composables/useBarcodeDetections.ts`, which encapsulates the logic for managing barcode detections, providing a clean and reactive API for use across different components.

NGI internally uses **Code_128** for plate labels.

## Inventory barcodes

Items, containers and storage equipment each carry a unique barcode. Rooms do not:
they are never physically handled, so there is nothing to put a label on.

Barcodes are **issued automatically when an entity is created**. When registering an
item, container or storage equipment, the create form's *Barcode* selector defaults
to *Generate barcode*; choosing *Use existing* reveals an extra step that scans or
accepts a pre-existing label (for example a vendor's own code). The scan step reuses
an autofocused, debounced reader field plus an optional device camera, wrapped in the
reusable `app/components/barcode/InventoryScanner.vue` component (kept separate from,
and modelled loosely on, the login-token scanner). A supplied code need not follow the
Firn prefix scheme; the server enforces global uniqueness on save. An existing entity
can also be given one, or have its code re-issued, from the *Barcode* dialog on its
detail page.

### Format

```
<prefix><8 random base36 characters><1 check character>
```

Example: `fi7k2m9xq4c`

| Prefix | Meaning |
|---|---|
| `fi` | Inventory item |
| `fc` | Container |
| `fe` | Storage equipment |
| `fa` | Action card |
| `ft` | Login token (**not** an inventory barcode — see `useTokenBarcode.ts`) |

The format is deliberately self-describing. A scanner reading `fc…` knows it has a
container before any database lookup happens, which is what lets a scanned set be
interpreted locally as it is being built.

Codes are lowercase base36 and normalised to lowercase on lookup, so a scanner
configured to emit uppercase still resolves. Code 128 set B covers this alphabet.

### Check character

The final character is a weighted sum mod 36 over the prefix and payload. Its
purpose is to reject a misread *before* a round trip to the server, and to stop a
typo in a manually entered code from silently resolving to a different entity.

The weights are all coprime with 36, which guarantees that **every** single-character
substitution is detected. Adjacent transpositions are caught roughly 94% of the
time. Positional weights (1, 2, 3, …) would not achieve this: a shift of 6 at
position 6 would go unnoticed, because 6 divides 36.

A code that starts with a Firn prefix but fails the check character is reported as
*invalid*, not as an external label. Masking a misread as someone else's barcode
would be the worse failure.

### External labels

A vendor's own barcode can be stored instead of a Firn-issued one. Such a code still
resolves when scanned; it is simply shown as an *External label* rather than
implying Firn issued it. Uniqueness is enforced across **all** entity types, since a
code must identify exactly one physical object.

### Action cards

Scanning entities with no action card checks them out, or returns them if they are
already checked out. That toggle covers the overwhelmingly common case and needs no
extra label.

Anything else requires exactly one action card in the scanned set. These codes are
deterministic and backed by no database documents, so the reference sheet can be
printed once and stays valid indefinitely. Generate it from the dedicated
*Action barcodes* page at `/inventory/barcodes/actions` (linked from the inventory
navigation and landing page), which previews or downloads the sheet as a PDF.

| Action | Barcode |
|---|---|
| `dispose` | `fadispose1` |
| `reserve` | `fareserveu` |
| `unreserve` | `faunreservej` |
| `mark_expired` | `faexpiredd` |
| `locate` | `falocatej` |
| `move` | `famove8` |

There is deliberately **no** card for `checkout`, `return`, `post_missing` or `note`:
the first two are the default behaviour, an entity whose barcode was just scanned is
by definition not missing (`locate` is the meaningful counterpart), and a note is
meaningless without typed free text.

### How a scanned set is interpreted

See design decision 14 in `docs/inventory.md`.

### Printing

The dedicated label printer is not wired up yet. Until it is, labels and the action
sheet are produced as PDFs by `app/composables/useInventoryBarcode.ts`, which shares
its Code 128 rendering with the token sheets via `app/utils/barcodeRendering.ts`.

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
