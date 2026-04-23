import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from 'pdf-lib';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { Order } from 'src/orders/entities/order.entity';
import { PaymentTransaction } from 'src/payments/entities/payment-transaction.entity';
import { WorkshopOrderSummary } from 'src/workshops/entities/workshop-order-summary.entity';
import { User } from 'src/users/entities/user.entity';

type InvoiceParty = {
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  cityStateZip: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
};

type InvoiceItem = {
  name: string;
  sku?: string | null;
  quantity: number;
  unitPrice: string | number;
  total: string | number;
};

type InvoiceDocument = {
  invoiceNumber: string;
  orderNumber: string;
  invoiceDate: string;
  currency: string;
  purchaseType: 'PRODUCT' | 'WORKSHOP';
  supplier: InvoiceParty;
  buyer: InvoiceParty;
  shipTo: InvoiceParty;
  items: InvoiceItem[];
  subtotal: string | number;
  shippingAmount: string | number;
  taxAmount: string | number;
  grandTotal: string | number;
  paymentStatus: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentTerms?: string | null;
  bankInfo?: string | null;
  notes?: string | null;
};

const COLORS = {
  primary: rgb(0.17, 0.72, 0.94),
  primarySoft: rgb(0.93, 0.97, 0.99),
  text: rgb(0.12, 0.16, 0.23),
  muted: rgb(0.45, 0.52, 0.62),
  border: rgb(0.84, 0.89, 0.94),
  white: rgb(1, 1, 1),
  success: rgb(0.04, 0.55, 0.28),
};

@Injectable()
export class InvoiceService {
  constructor(private readonly config: ConfigService) {}

  private async getInvoiceLogoBytes(): Promise<Uint8Array | null> {
    const candidates = [
      path.join(process.cwd(), 'src', 'common', 'assets', 'Texas_Airway.png'),
      path.join(process.cwd(), 'dist', 'common', 'assets', 'Texas_Airway.png'),
    ];

    for (const filePath of candidates) {
      try {
        return await readFile(filePath);
      } catch {
        // try next path
      }
    }

    return null;
  }

  private money(value: string | number | null | undefined, currency = 'USD') {
    const parsed =
      typeof value === 'number' ? value : Number.parseFloat(value ?? '0');

    if (Number.isNaN(parsed)) {
      return currency === 'USD' ? '$0.00' : `0.00 ${currency}`;
    }

    return currency === 'USD'
      ? `$${parsed.toFixed(2)}`
      : `${parsed.toFixed(2)} ${currency}`;
  }

  private drawText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color = COLORS.text,
  ) {
    page.drawText(text, { x, y, size, font, color });
  }

  private drawRightText(
    page: PDFPage,
    text: string,
    rightX: number,
    y: number,
    font: PDFFont,
    size: number,
    color = COLORS.text,
  ) {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: rightX - width,
      y,
      size,
      font,
      color,
    });
  }

  private drawLine(
    page: PDFPage,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness = 1,
    color = COLORS.border,
  ) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color,
    });
  }

  private drawBox(
    page: PDFPage,
    x: number,
    topY: number,
    width: number,
    height: number,
    fill = COLORS.white,
    border = COLORS.border,
  ) {
    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      color: fill,
      borderColor: border,
      borderWidth: 1,
    });
  }

  private drawWrappedText(
    page: PDFPage,
    text: string,
    x: number,
    topY: number,
    maxWidth: number,
    font: PDFFont,
    size: number,
    lineHeight: number,
    color = COLORS.text,
    maxLines?: number,
  ) {
    const words = String(text ?? '')
      .split(/\s+/)
      .filter(Boolean);

    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(test, size);

      if (width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);

    const finalLines =
      typeof maxLines === 'number' ? lines.slice(0, maxLines) : lines;

    finalLines.forEach((line, index) => {
      page.drawText(line, {
        x,
        y: topY - index * lineHeight,
        size,
        font,
        color,
      });
    });

    return finalLines.length;
  }

  private drawCircleLogo(
    page: PDFPage,
    centerX: number,
    centerY: number,
    outerRadius = 18,
  ) {
    page.drawCircle({
      x: centerX,
      y: centerY,
      size: outerRadius,
      color: COLORS.primary,
      borderColor: COLORS.primary,
      borderWidth: 1,
    });

    const squareSize = 13;
    const squareX = centerX - squareSize / 2;
    const squareY = centerY - squareSize / 2;

    page.drawRectangle({
      x: squareX,
      y: squareY,
      width: squareSize,
      height: squareSize,
      borderColor: COLORS.white,
      borderWidth: 1.8,
    });

    page.drawLine({
      start: { x: centerX, y: centerY - 4 },
      end: { x: centerX, y: centerY + 4 },
      thickness: 1.8,
      color: COLORS.white,
    });

    page.drawLine({
      start: { x: centerX - 4, y: centerY },
      end: { x: centerX + 4, y: centerY },
      thickness: 1.8,
      color: COLORS.white,
    });
  }

  private drawAddressBlock(
    page: PDFPage,
    x: number,
    topY: number,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    data: {
      title: string;
      name: string;
      addressLine1: string;
      addressLine2?: string | null;
      cityStateZip: string;
      taxId?: string | null;
      email?: string | null;
      phone?: string | null;
    },
  ) {
    this.drawText(page, data.title, x, topY, fontBold, 9, COLORS.muted);
    this.drawText(
      page,
      data.name || '—',
      x,
      topY - 18,
      fontBold,
      11.5,
      COLORS.text,
    );
    this.drawText(
      page,
      data.addressLine1 || '—',
      x,
      topY - 36,
      fontRegular,
      10.2,
      COLORS.text,
    );

    let nextY = topY - 52;

    if (data.addressLine2) {
      this.drawText(
        page,
        data.addressLine2,
        x,
        nextY,
        fontRegular,
        10.2,
        COLORS.text,
      );
      nextY -= 16;
    }

    this.drawText(
      page,
      data.cityStateZip || '—',
      x,
      nextY,
      fontRegular,
      10.2,
      COLORS.text,
    );
    nextY -= 16;

    if (data.taxId) {
      this.drawText(
        page,
        `Tax ID / EIN: ${data.taxId}`,
        x,
        nextY,
        fontRegular,
        9.2,
        COLORS.muted,
      );
      nextY -= 14;
    }

    if (data.email) {
      this.drawText(
        page,
        `Email: ${data.email}`,
        x,
        nextY,
        fontRegular,
        9.2,
        COLORS.muted,
      );
      nextY -= 14;
    }

    if (data.phone) {
      this.drawText(
        page,
        `Phone: ${data.phone}`,
        x,
        nextY,
        fontRegular,
        9.2,
        COLORS.muted,
      );
    }
  }

  private getSupplier(): InvoiceParty {
    const addressLine1 =
      this.config.get<string>('INVOICE_SUPPLIER_ADDRESS_LINE1') ||
      '1234 Medical Center Dr, Suite 500';
    const addressLine2 =
      this.config.get<string>('INVOICE_SUPPLIER_ADDRESS_LINE2') || null;
    const city = this.config.get<string>('INVOICE_SUPPLIER_CITY') || 'Houston';
    const state = this.config.get<string>('INVOICE_SUPPLIER_STATE') || 'TX';
    const zip = this.config.get<string>('INVOICE_SUPPLIER_ZIP') || '77030';

    return {
      name:
        this.config.get<string>('INVOICE_SUPPLIER_NAME') ||
        'Texas Airway Institute',
      addressLine1,
      addressLine2,
      cityStateZip: `${city}, ${state} ${zip}`,
      taxId: this.config.get<string>('INVOICE_SUPPLIER_EIN') || null,
      email:
        this.config.get<string>('INVOICE_SUPPLIER_EMAIL') ||
        this.config.get<string>('SES_FROM_EMAIL') ||
        null,
      phone: this.config.get<string>('INVOICE_SUPPLIER_PHONE') || null,
    };
  }

  private toCityStateZip(
    city?: string | null,
    state?: string | null,
    zip?: string | null,
  ) {
    return [city, state, zip].filter(Boolean).join(', ').replace(', ,', ',');
  }

  async generateProductInvoiceBuffer(params: {
    order: Order & { items?: any[] };
    payment: PaymentTransaction;
    user: User;
  }): Promise<Buffer> {
    const { order, payment, user } = params;

    const items = Array.isArray((order as any).items)
      ? (order as any).items
      : [];

    const doc: InvoiceDocument = {
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      invoiceDate: new Date(order.createdAt).toLocaleDateString('en-US'),
      currency: 'USD',
      purchaseType: 'PRODUCT',
      supplier: this.getSupplier(),
      buyer: {
        name: order.customerName || user.fullLegalName || 'Customer',
        addressLine1: order.shippingAddressLine1 || '—',
        addressLine2: order.shippingAddressLine2 || null,
        cityStateZip: this.toCityStateZip(
          order.shippingCity,
          order.shippingState,
          order.shippingPostalCode,
        ),
        email: order.customerEmail || user.medicalEmail || null,
        phone: order.customerPhone || user.phoneNumber || null,
      },
      shipTo: {
        name: order.customerName || user.fullLegalName || 'Customer',
        addressLine1: order.shippingAddressLine1 || '—',
        addressLine2: order.shippingAddressLine2 || null,
        cityStateZip: this.toCityStateZip(
          order.shippingCity,
          order.shippingState,
          order.shippingPostalCode,
        ),
        email: order.customerEmail || user.medicalEmail || null,
        phone: order.customerPhone || user.phoneNumber || null,
      },
      items: items.map((item: any) => ({
        name: item.productName || item.name || 'Product',
        sku: item.sku || null,
        quantity: Number(item.quantity || 0),
        unitPrice: item.unitPrice || 0,
        total: item.total || 0,
      })),
      subtotal: order.subtotal,
      shippingAmount: order.shippingAmount,
      taxAmount: order.taxAmount,
      grandTotal: order.grandTotal,
      paymentStatus: order.paymentStatus || 'PAID',
      paymentMethod: payment.provider || 'STRIPE',
      paymentReference:
        payment.providerPaymentIntentId ||
        payment.providerSessionId ||
        payment.id,
      paymentTerms:
        this.config.get<string>('INVOICE_PAYMENT_TERMS') || 'Due on receipt',
      bankInfo: this.config.get<string>('INVOICE_BANK_INFO') || null,
      notes:
        'This invoice confirms payment for your product purchase. Please retain this document for your records.',
    };

    return this.renderInvoice(doc);
  }

  async generateWorkshopInvoiceBuffer(params: {
    orderSummary: WorkshopOrderSummary;
    payment: PaymentTransaction;
    user: User;
  }): Promise<Buffer> {
    const { orderSummary, payment, user } = params;

    const workshop: any = (orderSummary as any).workshop;
    const attendees: any[] = Array.isArray((orderSummary as any).attendees)
      ? (orderSummary as any).attendees
      : [];

    const attendeeCount =
      attendees.length || Number((orderSummary as any).numberOfSeats || 1);
    const unitPrice = Number((orderSummary as any).pricePerSeat || 0);
    const totalPrice = Number((orderSummary as any).totalPrice || 0);

    const buyerName =
      user.fullLegalName ||
      user.shippingFullName ||
      user.medicalEmail ||
      'Customer';

    const cityStateZip = this.toCityStateZip(
      user.shippingCity,
      user.shippingState,
      user.shippingPostalCode,
    );

    const workshopDate = workshop?.registrationDeadline
      ? new Date(workshop.registrationDeadline).toLocaleDateString('en-US')
      : new Date(orderSummary.createdAt).toLocaleDateString('en-US');

    const doc: InvoiceDocument = {
      invoiceNumber: `INV-WS-${orderSummary.id.slice(0, 8).toUpperCase()}`,
      orderNumber: `WORKSHOP-${orderSummary.id.slice(0, 8).toUpperCase()}`,
      invoiceDate: new Date(orderSummary.createdAt).toLocaleDateString('en-US'),
      currency: 'USD',
      purchaseType: 'WORKSHOP',
      supplier: this.getSupplier(),
      buyer: {
        name: buyerName,
        addressLine1: user.shippingAddressLine1 || '—',
        addressLine2: user.shippingAddressLine2 || null,
        cityStateZip: cityStateZip || '—',
        email: user.medicalEmail || null,
        phone: user.phoneNumber || null,
      },
      shipTo: {
        name: buyerName,
        addressLine1: user.shippingAddressLine1 || '—',
        addressLine2: user.shippingAddressLine2 || null,
        cityStateZip: cityStateZip || '—',
        email: user.medicalEmail || null,
        phone: user.phoneNumber || null,
      },
      items: [
        {
          name: workshop?.title
            ? `Workshop: ${workshop.title} (${workshopDate})`
            : 'Workshop Enrollment',
          sku: workshop?.id || orderSummary.id,
          quantity: attendeeCount,
          unitPrice,
          total: totalPrice,
        },
      ],
      subtotal: totalPrice,
      shippingAmount: 0,
      taxAmount: 0,
      grandTotal: totalPrice,
      paymentStatus: 'PAID',
      paymentMethod: payment.provider || 'STRIPE',
      paymentReference:
        payment.providerPaymentIntentId ||
        payment.providerSessionId ||
        payment.id,
      paymentTerms:
        this.config.get<string>('INVOICE_PAYMENT_TERMS') || 'Due on receipt',
      bankInfo: this.config.get<string>('INVOICE_BANK_INFO') || null,
      notes:
        attendees.length > 0
          ? `Registered attendees: ${attendees
              .map((a: any) => a.fullName || a.name || a.email || 'Attendee')
              .join(', ')}`
          : 'This invoice confirms payment for your workshop registration.',
    };

    return this.renderInvoice(doc);
  }

  private async renderInvoice(doc: InvoiceDocument): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const left = 30;
    const right = width - 30;

    let y = height - 34;

    const logoBytes = await this.getInvoiceLogoBytes();

    if (logoBytes) {
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const scaled = logoImage.scale(0.22);

      page.drawImage(logoImage, {
        x: left,
        y: y - 54,
        width: scaled.width,
        height: scaled.height,
      });

      this.drawText(
        page,
        doc.supplier.addressLine1,
        left + scaled.width + 14,
        y - 22,
        fontRegular,
        9.2,
        COLORS.muted,
      );
      this.drawText(
        page,
        doc.supplier.cityStateZip,
        left + scaled.width + 14,
        y - 36,
        fontRegular,
        9.2,
        COLORS.muted,
      );
    } else {
      this.drawCircleLogo(page, left + 18, y + 4, 18);
      this.drawText(
        page,
        'Texas Airway',
        left + 42,
        y + 6,
        fontBold,
        16,
        COLORS.text,
      );
      this.drawText(
        page,
        'INSTITUTE',
        left + 42,
        y - 12,
        fontBold,
        10,
        COLORS.primary,
      );
      this.drawText(
        page,
        doc.supplier.addressLine1,
        left + 42,
        y - 30,
        fontRegular,
        9.2,
        COLORS.muted,
      );
      this.drawText(
        page,
        doc.supplier.cityStateZip,
        left + 42,
        y - 44,
        fontRegular,
        9.2,
        COLORS.muted,
      );
    }

    this.drawRightText(
      page,
      'INVOICE',
      right,
      y + 2,
      fontBold,
      18,
      COLORS.text,
    );

    y -= 72;

    const cardGap = 14;
    const invoiceBoxW = 215;
    const smallBoxW = 146;
    const infoBoxH = 84;

    this.drawBox(
      page,
      left,
      y,
      invoiceBoxW,
      infoBoxH,
      COLORS.primarySoft,
      COLORS.border,
    );
    this.drawBox(
      page,
      left + invoiceBoxW + cardGap,
      y,
      smallBoxW,
      infoBoxH,
      COLORS.white,
      COLORS.border,
    );
    this.drawBox(
      page,
      left + invoiceBoxW + cardGap + smallBoxW + cardGap,
      y,
      smallBoxW,
      infoBoxH,
      COLORS.white,
      COLORS.border,
    );

    this.drawText(
      page,
      'INVOICE NO',
      left + 14,
      y - 16,
      fontBold,
      9,
      COLORS.muted,
    );
    this.drawText(
      page,
      doc.invoiceNumber,
      left + 14,
      y - 38,
      fontBold,
      12.5,
      COLORS.text,
    );
    this.drawText(
      page,
      `Order Ref: ${doc.orderNumber}`,
      left + 14,
      y - 56,
      fontRegular,
      9.2,
      COLORS.muted,
    );

    const orderDateX = left + invoiceBoxW + cardGap;
    this.drawText(
      page,
      'INVOICE DATE',
      orderDateX + 14,
      y - 16,
      fontBold,
      9,
      COLORS.muted,
    );
    this.drawText(
      page,
      doc.invoiceDate,
      orderDateX + 14,
      y - 38,
      fontBold,
      12,
      COLORS.text,
    );
    this.drawText(
      page,
      doc.currency,
      orderDateX + 14,
      y - 56,
      fontRegular,
      9.2,
      COLORS.muted,
    );

    const paymentCardX = orderDateX + smallBoxW + cardGap;
    this.drawText(
      page,
      'PAYMENT',
      paymentCardX + 14,
      y - 16,
      fontBold,
      9,
      COLORS.muted,
    );
    this.drawText(
      page,
      doc.paymentStatus,
      paymentCardX + 14,
      y - 36,
      fontBold,
      11.5,
      COLORS.success,
    );
    this.drawText(
      page,
      `Method: ${doc.paymentMethod || '—'}`,
      paymentCardX + 14,
      y - 52,
      fontRegular,
      9,
      COLORS.muted,
    );
    this.drawWrappedText(
      page,
      `Ref: ${doc.paymentReference || '—'}`,
      paymentCardX + 14,
      y - 68,
      120,
      fontRegular,
      8.5,
      10,
      COLORS.muted,
      2,
    );

    y -= infoBoxH + 30;

    const detailsBoxH = 118;
    const detailsBoxW = 260;

    this.drawBox(
      page,
      left,
      y,
      detailsBoxW,
      detailsBoxH,
      COLORS.white,
      COLORS.border,
    );
    this.drawBox(
      page,
      left + detailsBoxW + cardGap,
      y,
      detailsBoxW,
      detailsBoxH,
      COLORS.white,
      COLORS.border,
    );

    this.drawAddressBlock(page, left + 14, y - 16, fontRegular, fontBold, {
      title: 'SUPPLIER',
      name: doc.supplier.name,
      addressLine1: doc.supplier.addressLine1,
      addressLine2: doc.supplier.addressLine2,
      cityStateZip: doc.supplier.cityStateZip,
      taxId: doc.supplier.taxId,
      email: doc.supplier.email,
      phone: doc.supplier.phone,
    });

    this.drawAddressBlock(
      page,
      left + detailsBoxW + cardGap + 14,
      y - 16,
      fontRegular,
      fontBold,
      {
        title: 'BILL TO',
        name: doc.buyer.name,
        addressLine1: doc.buyer.addressLine1,
        addressLine2: doc.buyer.addressLine2,
        cityStateZip: doc.buyer.cityStateZip,
        taxId: doc.buyer.taxId,
        email: doc.buyer.email,
        phone: doc.buyer.phone,
      },
    );

    y -= detailsBoxH + 24;

    this.drawText(page, 'ITEMS', left, y, fontBold, 14, COLORS.text);

    y -= 18;

    const tableX = left;
    const tableW = right - left;
    const headerH = 30;
    const rowH = 42;

    this.drawBox(
      page,
      tableX,
      y,
      tableW,
      headerH,
      COLORS.primarySoft,
      COLORS.border,
    );

    const colItemX = tableX + 12;
    const colSkuX = tableX + 290;
    const colQtyX = tableX + 376;
    const colPriceRight = tableX + 458;
    const colTotalRight = tableX + tableW - 20;

    this.drawText(page, 'ITEM', colItemX, y - 20, fontBold, 8.5, COLORS.muted);
    this.drawText(
      page,
      'SKU / REF',
      colSkuX,
      y - 20,
      fontBold,
      8.5,
      COLORS.muted,
    );
    this.drawText(page, 'QTY', colQtyX, y - 20, fontBold, 8.5, COLORS.muted);
    this.drawRightText(
      page,
      'UNIT PRICE',
      colPriceRight,
      y - 20,
      fontBold,
      8.5,
      COLORS.muted,
    );
    this.drawRightText(
      page,
      'TOTAL',
      colTotalRight,
      y - 20,
      fontBold,
      8.5,
      COLORS.muted,
    );

    y -= headerH;

    for (const item of doc.items) {
      this.drawBox(page, tableX, y, tableW, rowH, COLORS.white, COLORS.border);

      this.drawWrappedText(
        page,
        item.name,
        colItemX,
        y - 18,
        260,
        fontBold,
        10.2,
        12,
        COLORS.text,
        2,
      );

      this.drawWrappedText(
        page,
        item.sku || '—',
        colSkuX,
        y - 18,
        70,
        fontRegular,
        9.5,
        10,
        COLORS.text,
        2,
      );

      this.drawText(
        page,
        String(item.quantity || 0),
        colQtyX,
        y - 22,
        fontRegular,
        10,
        COLORS.text,
      );
      this.drawRightText(
        page,
        this.money(item.unitPrice, doc.currency),
        colPriceRight,
        y - 22,
        fontRegular,
        10,
        COLORS.text,
      );
      this.drawRightText(
        page,
        this.money(item.total, doc.currency),
        colTotalRight,
        y - 22,
        fontBold,
        10,
        COLORS.text,
      );

      y -= rowH;
    }

    y -= 18;

    const summaryW = 235;
    const summaryH = 158;
    const summaryX = right - summaryW;

    this.drawBox(
      page,
      summaryX,
      y,
      summaryW,
      summaryH,
      COLORS.primarySoft,
      COLORS.border,
    );

    const summaryLabelX = summaryX + 16;
    const summaryValueRight = summaryX + summaryW - 16;

    this.drawText(
      page,
      'Subtotal',
      summaryLabelX,
      y - 22,
      fontRegular,
      10.5,
      COLORS.text,
    );
    this.drawRightText(
      page,
      this.money(doc.subtotal, doc.currency),
      summaryValueRight,
      y - 22,
      fontBold,
      10.5,
      COLORS.text,
    );

    this.drawText(
      page,
      'Shipping',
      summaryLabelX,
      y - 44,
      fontRegular,
      10.5,
      COLORS.text,
    );
    this.drawRightText(
      page,
      this.money(doc.shippingAmount, doc.currency),
      summaryValueRight,
      y - 44,
      fontBold,
      10.5,
      COLORS.text,
    );

    this.drawText(
      page,
      'Tax',
      summaryLabelX,
      y - 66,
      fontRegular,
      10.5,
      COLORS.text,
    );
    this.drawRightText(
      page,
      this.money(doc.taxAmount, doc.currency),
      summaryValueRight,
      y - 66,
      fontBold,
      10.5,
      COLORS.text,
    );

    this.drawLine(
      page,
      summaryX + 16,
      y - 80,
      summaryX + summaryW - 16,
      y - 80,
    );

    this.drawText(
      page,
      'Grand Total',
      summaryLabelX,
      y - 104,
      fontBold,
      11.5,
      COLORS.text,
    );
    this.drawRightText(
      page,
      this.money(doc.grandTotal, doc.currency),
      summaryValueRight,
      y - 104,
      fontBold,
      15,
      COLORS.primary,
    );

    this.drawText(
      page,
      `Payment Terms: ${doc.paymentTerms || 'Due on receipt'}`,
      summaryLabelX,
      y - 126,
      fontRegular,
      8.8,
      COLORS.muted,
    );

    this.drawWrappedText(
      page,
      `Bank / Remittance: ${doc.bankInfo || 'Available upon request'}`,
      summaryLabelX,
      y - 142,
      200,
      fontRegular,
      8.5,
      10,
      COLORS.muted,
      2,
    );

    const footerY = 38;
    this.drawLine(
      page,
      left,
      footerY + 12,
      right,
      footerY + 12,
      1,
      COLORS.border,
    );
    this.drawWrappedText(
      page,
      doc.notes ||
        'Thank you for your purchase. This invoice was generated automatically and serves as your payment receipt.',
      left,
      footerY,
      right - left,
      fontRegular,
      8.8,
      10,
      COLORS.muted,
      3,
    );

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
