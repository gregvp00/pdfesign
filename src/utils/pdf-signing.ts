import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFHexString,
  PDFString,
  PDFArray,
  PDFNumber,
} from "pdf-lib";
import forge from "node-forge";
import { Buffer } from "buffer";

export interface SignerCredentials {
  privateKey: forge.pki.PrivateKey;
  certificate: forge.pki.Certificate;
  certificates: forge.pki.Certificate[]; // Chain
}

export interface ExistingSignature {
  fieldName: string;
  signerName: string;
  pageIndex: number;
  rect: number[]; // [x, y, w, h] normalized
}

/**
 * Parses the PDF to find existing digital signatures and extracts signer info.
 */
export async function getExistingSignatures(
  pdfBytes: ArrayBuffer
): Promise<ExistingSignature[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const results: ExistingSignature[] = [];

  for (const field of fields) {
    // Access the underlying dictionary to check the Field Type (FT)
    // We cast to 'any' because the specific field types in pdf-lib usually wrap the dict
    // in a protected or specific property that TS doesn't expose directly on the general interface.
    const acroField = field.acroField as any;

    if (acroField.dict.get(PDFName.of("FT")) === PDFName.of("Sig")) {
      const fieldName = field.getName();
      const widgets = field.acroField.getWidgets();

      // Get location from the first widget (visual appearance)
      let rect = [0, 0, 0, 0];
      let pageIndex = 0;

      if (widgets.length > 0) {
        const widget = widgets[0];
        const rectArr = widget.getRectangle();
        rect = [rectArr.x, rectArr.y, rectArr.width, rectArr.height];

        // Find which page this widget belongs to
        const pageRef = widget.P();
        if (pageRef) {
          pageIndex = pdfDoc.getPages().findIndex((p) => p.ref === pageRef);
        }
      }

      // Try to extract Signer Name from PKCS#7 Contents
      let signerName = "Unknown Signer";
      try {
        const value = acroField.dict.get(PDFName.of("V"));
        if (value instanceof PDFDict) {
          const contents = value.get(PDFName.of("Contents"));
          if (contents instanceof PDFHexString) {
            const hex = contents.asString();
            // Convert hex to binary string for forge
            const binary = Buffer.from(hex, "hex").toString("binary");
            const asn1 = forge.asn1.fromDer(binary);
            // Cast to any to bypass strict type checking on the Captured union
            const msg = forge.pkcs7.messageFromAsn1(asn1) as any;

            // Extract first signer's certificate info
            const signer = msg.certificates ? msg.certificates[0] : null;
            if (signer) {
              const cn = signer.subject.attributes.find(
                (attr: any) =>
                  attr.name === "commonName" || attr.shortName === "CN"
              );
              if (cn) signerName = cn.value as string;
            }
          }
        }
      } catch (e) {
        console.warn("Could not parse signature contents", e);
        signerName = "Signed (Unverified)";
      }

      results.push({ fieldName, signerName, pageIndex, rect });
    }
  }

  return results;
}

/**
 * Adds a visual placeholder and computes the ByteRange for signing.
 * Then generates a PKCS#7 signature and embeds it.
 */
export async function signPdf(
  pdfBytes: ArrayBuffer,
  credentials: SignerCredentials,
  visualSignature?: {
    pageIndex: number;
    rect: [number, number, number, number]; // x, y, width, height
    imagePng?: Uint8Array;
  },
  lockDocument: boolean = true
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const pages = pdfDoc.getPages();
  const page = pages[visualSignature?.pageIndex || 0];

  // 32KB buffer for signature
  const SIGNATURE_LENGTH = 32768;

  // 1. Prepare Signature Dictionary
  const signatureDict = pdfDoc.context.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    Contents: PDFHexString.of("0".repeat(SIGNATURE_LENGTH)),
    Reason: PDFString.of("Digitally Signed via PDFesign"),
    M: PDFString.fromDate(new Date()),
    ByteRange: [
      PDFNumber.of(0),
      PDFNumber.of(9999999999),
      PDFNumber.of(9999999999),
      PDFNumber.of(9999999999),
    ],
  });

  // --- LOCKING LOGIC (DocMDP) ---
  if (lockDocument) {
    // 1. Create Transform Params
    const transformParams = pdfDoc.context.obj({
      Type: "TransformParams",
      P: 1, // 1 = No changes allowed
      V: "1.2",
    });

    // 2. Create Reference Dict
    const referenceDict = pdfDoc.context.obj({
      Type: "SigRef",
      TransformMethod: "DocMDP",
      DigestMethod: "MD5",
      TransformParams: transformParams,
    });

    // 3. Add Reference to Signature
    signatureDict.set(
      PDFName.of("Reference"),
      pdfDoc.context.obj([referenceDict])
    );
  }

  const signatureRef = pdfDoc.context.register(signatureDict);

  // --- CRITICAL FIX FOR LOCKING: PERMS DICTIONARY ---
  // The PDF Catalog must have a /Perms entry pointing to this signature for DocMDP to work
  if (lockDocument) {
    const catalog = pdfDoc.catalog;
    const perms = pdfDoc.context.obj({
      DocMDP: signatureRef,
    });
    catalog.set(PDFName.of("Perms"), perms);
  }
  // --------------------------------------------------

  // 2. Calculate Correct PDF Rect [llx, lly, urx, ury]
  let widgetRect = [0, 0, 0, 0];
  if (visualSignature) {
    const [x, y, w, h] = visualSignature.rect;
    widgetRect = [x, y, x + w, y + h];
  }

  // 3. Create Widget Annotation
  const widgetDict = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    Rect: widgetRect,
    V: signatureRef,
    T: PDFString.of(`Signature-${Date.now()}`), // Unique name
    F: 4,
    P: page.ref,
  });

  const widgetRef = pdfDoc.context.register(widgetDict);

  // 4. Link Widget to Page
  let annots = page.node.lookup(PDFName.of("Annots")) as PDFArray | undefined;
  if (!annots) {
    annots = pdfDoc.context.obj([]) as PDFArray;
    page.node.set(PDFName.of("Annots"), annots);
  }
  annots.push(widgetRef);

  // 5. Link Widget to AcroForm
  let acroForm = pdfDoc.catalog.lookup(PDFName.of("AcroForm"));
  if (!acroForm) {
    acroForm = pdfDoc.context.obj({ Fields: [] });
    pdfDoc.catalog.set(PDFName.of("AcroForm"), acroForm);
  }
  const formDict = acroForm as PDFDict;

  // Set SigFlags (3 = SignaturesExist | AppendOnly)
  formDict.set(PDFName.of("SigFlags"), PDFNumber.of(3));

  let fields = formDict.lookup(PDFName.of("Fields")) as PDFArray;
  if (!fields) {
    fields = pdfDoc.context.obj([]) as PDFArray;
    formDict.set(PDFName.of("Fields"), fields);
  }
  fields.push(widgetRef);

  // 6. Draw Visual Stamp (Image)
  if (visualSignature && visualSignature.imagePng) {
    const img = await pdfDoc.embedPng(visualSignature.imagePng);
    page.drawImage(img, {
      x: visualSignature.rect[0],
      y: visualSignature.rect[1],
      width: visualSignature.rect[2],
      height: visualSignature.rect[3],
    });
  }

  // 7. Save PDF (without object streams)
  const pdfBytesWithPlaceholder = await pdfDoc.save({
    useObjectStreams: false,
  });
  const pdfBuffer = Buffer.from(pdfBytesWithPlaceholder);

  // 8. Locate ByteRange Placeholder
  const placeholderPattern =
    /\/ByteRange\s*\[\s*0\s+9999999999\s+9999999999\s+9999999999\s*\]/;
  const match = placeholderPattern.exec(pdfBuffer.toString("binary"));

  if (!match) {
    throw new Error("Could not find ByteRange placeholder.");
  }

  const byteRangePos = match.index;
  const byteRangeLength = match[0].length;

  // 9. Find Contents Hex String
  let contentsKeyPos = pdfBuffer.lastIndexOf("/Contents", byteRangePos);
  if (contentsKeyPos === -1)
    contentsKeyPos = pdfBuffer.indexOf("/Contents", byteRangePos);
  if (contentsKeyPos === -1) throw new Error("Could not find /Contents key.");

  let contentsStart = -1;
  for (let i = contentsKeyPos + 9; i < pdfBuffer.length; i++) {
    if (pdfBuffer[i] === 0x3c) {
      contentsStart = i;
      break;
    }
  }
  const contentsEnd = pdfBuffer.indexOf(">", contentsStart);

  // 10. Define ByteRanges
  const part1Length = contentsStart;
  const part2Start = contentsEnd + 1;
  const part2Length = pdfBuffer.length - part2Start;

  const byteRange = [0, part1Length, part2Start, part2Length];

  // 11. Update ByteRange in File
  let newByteRangeStr = `/ByteRange [${byteRange.join(" ")}]`;
  if (newByteRangeStr.length > byteRangeLength)
    throw new Error("ByteRange string exceeds placeholder size.");
  newByteRangeStr += " ".repeat(byteRangeLength - newByteRangeStr.length);

  const byteRangeBuffer = Buffer.from(newByteRangeStr);
  byteRangeBuffer.copy(pdfBuffer, byteRangePos);

  // 12. Hash and Sign
  const p1 = pdfBuffer.subarray(0, part1Length);
  const p2 = pdfBuffer.subarray(part2Start);

  const md = forge.md.sha256.create();
  md.update(p1.toString("binary"));
  md.update(p2.toString("binary"));

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer("");

  p7.addCertificate(credentials.certificate);
  if (credentials.certificates.length > 0) {
    credentials.certificates.forEach((c) => p7.addCertificate(c));
  }

  p7.addSigner({
    key: credentials.privateKey as any,
    certificate: credentials.certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as any },
    ],
  });

  p7.sign({ detached: true });

  const rawSignature = forge.asn1.toDer(p7.toAsn1()).getBytes();
  let hexSignature = forge.util.bytesToHex(rawSignature);

  const availableSpace = contentsEnd - contentsStart - 2;
  if (hexSignature.length > availableSpace)
    throw new Error(`Signature size exceeds placeholder.`);

  hexSignature += "0".repeat(availableSpace - hexSignature.length);

  // 13. Write Signature
  const signatureBuffer = Buffer.from(hexSignature);
  signatureBuffer.copy(pdfBuffer, contentsStart + 1);

  return pdfBuffer;
}
