// import {
//   BadRequestException,
//   Injectable,
//   InternalServerErrorException,
//   Logger,
// } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import * as nodemailer from 'nodemailer';
// import {
//   ContactInquiryType,
//   CreateContactUsDto,
// } from './dto/create-contact-us.dto';

// @Injectable()
// export class ContactUsService {
//   private readonly logger = new Logger(ContactUsService.name);
//   private readonly transporter: nodemailer.Transporter;

//   constructor(private readonly configService: ConfigService) {
//     const host = this.configService.get<string>('SMTP_HOST');
//     const port = 465;
//     const user = this.configService.get<string>('SMTP_USER');
//     const pass = this.configService.get<string>('SMTP_PASS');

//     if (!host || !user || !pass) {
//       throw new Error('SMTP configuration is missing.');
//     }

//     this.transporter = nodemailer.createTransport({
//       host,
//       port,
//       secure: true,
//       auth: {
//         user,
//         pass,
//       },
//     });
//   }

//   async sendContactMessage(dto: CreateContactUsDto) {
//     const fromEmail =
//       this.configService.get<string>('SMTP_FROM') ||
//       this.configService.get<string>('SMTP_USER');

//     const receiverEmail =
//       this.configService.get<string>('CONTACT_RECEIVER_EMAIL') || fromEmail;

//     if (!fromEmail || !receiverEmail) {
//       throw new BadRequestException(
//         'Mail sender or receiver is not configured.',
//       );
//     }

//     const inquiryLabel = this.getInquiryLabel(dto.inquiryType);

//     const formattedMessage = this.escapeHtml(
//       dto.message
//         .replace(/\r\n/g, '\n')
//         .split('\n')
//         .map((line) => line.trim())
//         .join('\n')
//         .trim(),
//     );

//     try {
//       await this.transporter.sendMail({
//         from: `"Website Contact Form" <${fromEmail}>`,
//         to: receiverEmail,
//         replyTo: dto.email,
//         subject: `[Contact Us] ${inquiryLabel} - ${dto.fullName}`,
//         html: `
//           <div style="margin:0;padding:0;background-color:#f4f7fb;">
//             <table
//               role="presentation"
//               width="100%"
//               cellpadding="0"
//               cellspacing="0"
//               border="0"
//               style="background-color:#f4f7fb;padding:32px 16px;"
//             >
//               <tr>
//                 <td align="center">
//                   <table
//                     role="presentation"
//                     width="100%"
//                     cellpadding="0"
//                     cellspacing="0"
//                     border="0"
//                     style="max-width:720px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;"
//                   >
//                     <tr>
//                       <td style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:28px 32px;">
//                         <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-family:Arial,sans-serif;">
//                           Website Contact Form
//                         </p>
//                         <h1 style="margin:0;font-size:28px;line-height:36px;color:#ffffff;font-family:Arial,sans-serif;">
//                           New Contact Us Submission
//                         </h1>
//                         <p style="margin:10px 0 0 0;font-size:14px;line-height:22px;color:#dbeafe;font-family:Arial,sans-serif;">
//                           A new inquiry has been submitted from your website contact form.
//                         </p>
//                       </td>
//                     </tr>

//                     <tr>
//                       <td style="padding:32px;">
//                         <table
//                           role="presentation"
//                           width="100%"
//                           cellpadding="0"
//                           cellspacing="0"
//                           border="0"
//                           style="border-collapse:collapse;"
//                         >
//                           <tr>
//                             <td style="padding:0 0 16px 0;">
//                               <table
//                                 role="presentation"
//                                 width="100%"
//                                 cellpadding="0"
//                                 cellspacing="0"
//                                 border="0"
//                                 style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;"
//                               >
//                                 <tr>
//                                   <td style="padding:20px 24px;font-family:Arial,sans-serif;">
//                                     <p style="margin:0 0 14px 0;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">
//                                       Contact Details
//                                     </p>

//                                     <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a;">
//                                       <span style="display:inline-block;width:120px;font-weight:700;color:#334155;">Full Name:</span>
//                                       ${this.escapeHtml(dto.fullName)}
//                                     </p>

//                                     <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a;">
//                                       <span style="display:inline-block;width:120px;font-weight:700;color:#334155;">Email:</span>
//                                       <a href="mailto:${this.escapeHtml(dto.email)}" style="color:#2563eb;text-decoration:none;">
//                                         ${this.escapeHtml(dto.email)}
//                                       </a>
//                                     </p>

//                                     <p style="margin:0;font-size:15px;color:#0f172a;">
//                                       <span style="display:inline-block;width:120px;font-weight:700;color:#334155;">Inquiry Type:</span>
//                                       <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700;">
//                                         ${this.escapeHtml(inquiryLabel)}
//                                       </span>
//                                     </p>
//                                   </td>
//                                 </tr>
//                               </table>
//                             </td>
//                           </tr>

//                           <tr>
//                             <td>
//                               <table
//                                 role="presentation"
//                                 width="100%"
//                                 cellpadding="0"
//                                 cellspacing="0"
//                                 border="0"
//                                 style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;"
//                               >
//                                 <tr>
//                                   <td style="padding:20px 24px;font-family:Arial,sans-serif;">
//                                     <p style="margin:0 0 14px 0;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">
//                                       Message
//                                     </p>
//                                     <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;font-size:15px;line-height:30px;color:#1e293b;white-space:pre-line;word-break:break-word;">${formattedMessage}</div>
//                                   </td>
//                                 </tr>
//                               </table>
//                             </td>
//                           </tr>

//                           <tr>
//                             <td style="padding-top:20px;">
//                               <p style="margin:0;font-size:12px;line-height:20px;color:#94a3b8;font-family:Arial,sans-serif;text-align:center;">
//                                 This email was generated automatically from the website contact form.
//                               </p>
//                             </td>
//                           </tr>
//                         </table>
//                       </td>
//                     </tr>
//                   </table>
//                 </td>
//               </tr>
//             </table>
//           </div>
//         `,
//         text: `
// New Contact Us Submission

// Full Name: ${dto.fullName}
// Email: ${dto.email}
// Inquiry Type: ${inquiryLabel}

// Message:
// ${dto.message}
//         `,
//       });

//       await this.transporter.sendMail({
//         from: `"Support Team" <${fromEmail}>`,
//         to: dto.email,
//         subject: 'We received your message',
//         html: `
//           <div style="margin:0;padding:0;background-color:#f4f7fb;">
//             <table
//               role="presentation"
//               width="100%"
//               cellpadding="0"
//               cellspacing="0"
//               border="0"
//               style="background-color:#f4f7fb;padding:32px 16px;"
//             >
//               <tr>
//                 <td align="center">
//                   <table
//                     role="presentation"
//                     width="100%"
//                     cellpadding="0"
//                     cellspacing="0"
//                     border="0"
//                     style="max-width:680px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;"
//                   >
//                     <tr>
//                       <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:28px 32px;">
//                         <h2 style="margin:0;font-size:26px;line-height:34px;color:#ffffff;font-family:Arial,sans-serif;">
//                           Thank you for contacting us
//                         </h2>
//                         <p style="margin:10px 0 0 0;font-size:14px;line-height:22px;color:#e0f2fe;font-family:Arial,sans-serif;">
//                           We have successfully received your message.
//                         </p>
//                       </td>
//                     </tr>

//                     <tr>
//                       <td style="padding:32px;font-family:Arial,sans-serif;color:#1e293b;">
//                         <p style="margin:0 0 16px 0;font-size:15px;line-height:26px;">
//                           Hello ${this.escapeHtml(dto.fullName)},
//                         </p>

//                         <p style="margin:0 0 16px 0;font-size:15px;line-height:26px;">
//                           Thank you for reaching out to us. We received your inquiry regarding
//                           <strong>${this.escapeHtml(inquiryLabel)}</strong>.
//                         </p>

//                         <div style="margin:24px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;">
//                           <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;">
//                             Your Submitted Message
//                           </p>
//                           <div style="margin:0;font-size:15px;line-height:30px;color:#334155;white-space:pre-line;word-break:break-word;">${formattedMessage}</div>
//                         </div>

//                         <p style="margin:0 0 16px 0;font-size:15px;line-height:26px;">
//                           Our team will review your request and get back to you as soon as possible.
//                         </p>

//                         <p style="margin:24px 0 0 0;font-size:15px;line-height:26px;">
//                           Best regards,<br />
//                           <strong>Support Team</strong>
//                         </p>
//                       </td>
//                     </tr>
//                   </table>
//                 </td>
//               </tr>
//             </table>
//           </div>
//         `,
//         text: `
// Hello ${dto.fullName},

// Thank you for contacting us.
// We received your inquiry regarding ${inquiryLabel}.

// Your submitted message:
// ${dto.message}

// Our team will get back to you as soon as possible.

// Best regards,
// Support Team
//         `,
//       });

//       return {
//         message: 'Your message has been sent successfully.',
//       };
//     } catch (error) {
//       this.logger.error('Failed to send contact email', error);
//       throw new InternalServerErrorException(
//         'Failed to send message. Please try again later.',
//       );
//     }
//   }

//   private getInquiryLabel(type: ContactInquiryType): string {
//     const labels: Record<ContactInquiryType, string> = {
//       [ContactInquiryType.GENERAL_INQUIRY]: 'General Inquiry',
//       [ContactInquiryType.ENROLLMENT]: 'Enrollment',
//       [ContactInquiryType.FACILITY_BOOKING]: 'Facility Booking',
//       [ContactInquiryType.TECHNICAL_SUPPORT]: 'Technical Support',
//     };

//     return labels[type];
//   }

//   private escapeHtml(value: string): string {
//     return value
//       .replace(/&/g, '&amp;')
//       .replace(/</g, '&lt;')
//       .replace(/>/g, '&gt;')
//       .replace(/"/g, '&quot;')
//       .replace(/'/g, '&#039;');
//   }
// }

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  ContactInquiryType,
  CreateContactUsDto,
} from './dto/create-contact-us.dto';

@Injectable()
export class ContactUsService implements OnModuleInit {
  private readonly logger = new Logger(ContactUsService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      throw new Error('SMTP configuration is missing.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: {
        servername: host,
      },
    });
  }

  async onModuleInit() {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP transporter verified successfully');
    } catch (error) {
      this.logger.error(
        'SMTP transporter verification failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sendContactMessage(dto: CreateContactUsDto) {
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER');

    const receiverEmail =
      this.configService.get<string>('CONTACT_RECEIVER_EMAIL') || fromEmail;

    if (!fromEmail || !receiverEmail) {
      throw new BadRequestException(
        'Mail sender or receiver is not configured.',
      );
    }

    const inquiryLabel = this.getInquiryLabel(dto.inquiryType);

    const normalizedMessage = dto.message
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();

    const formattedMessage = this.escapeHtml(normalizedMessage);

    try {
      await this.transporter.sendMail({
        from: `"Website Contact Form" <${fromEmail}>`,
        to: receiverEmail,
        replyTo: dto.email,
        subject: `[Contact Us] ${inquiryLabel} - ${dto.fullName}`,
        html: `
          <div style="margin:0;padding:0;background-color:#f4f7fb;">
            <table
              role="presentation"
              width="100%"
              cellpadding="0"
              cellspacing="0"
              border="0"
              style="background-color:#f4f7fb;padding:32px 16px;"
            >
              <tr>
                <td align="center">
                  <table
                    role="presentation"
                    width="100%"
                    cellpadding="0"
                    cellspacing="0"
                    border="0"
                    style="max-width:720px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;"
                  >
                    <tr>
                      <td style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:28px 32px;">
                        <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-family:Arial,sans-serif;">
                          Website Contact Form
                        </p>
                        <h1 style="margin:0;font-size:28px;line-height:36px;color:#ffffff;font-family:Arial,sans-serif;">
                          New Contact Us Submission
                        </h1>
                        <p style="margin:10px 0 0 0;font-size:14px;line-height:22px;color:#dbeafe;font-family:Arial,sans-serif;">
                          A new inquiry has been submitted from your website contact form.
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:32px;">
                        <table
                          role="presentation"
                          width="100%"
                          cellpadding="0"
                          cellspacing="0"
                          border="0"
                          style="border-collapse:collapse;"
                        >
                          <tr>
                            <td style="padding:0 0 16px 0;">
                              <table
                                role="presentation"
                                width="100%"
                                cellpadding="0"
                                cellspacing="0"
                                border="0"
                                style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;"
                              >
                                <tr>
                                  <td style="padding:20px 24px;font-family:Arial,sans-serif;">
                                    <p style="margin:0 0 14px 0;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">
                                      Contact Details
                                    </p>

                                    <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a;">
                                      <span style="display:inline-block;width:120px;font-weight:700;color:#334155;">Full Name:</span>
                                      ${this.escapeHtml(dto.fullName)}
                                    </p>

                                    <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a;">
                                      <span style="display:inline-block;width:120px;font-weight:700;color:#334155;">Email:</span>
                                      <a href="mailto:${this.escapeHtml(dto.email)}" style="color:#2563eb;text-decoration:none;">
                                        ${this.escapeHtml(dto.email)}
                                      </a>
                                    </p>

                                    <p style="margin:0;font-size:15px;color:#0f172a;">
                                      <span style="display:inline-block;width:120px;font-weight:700;color:#334155;">Inquiry Type:</span>
                                      <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700;">
                                        ${this.escapeHtml(inquiryLabel)}
                                      </span>
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>

                          <tr>
                            <td>
                              <table
                                role="presentation"
                                width="100%"
                                cellpadding="0"
                                cellspacing="0"
                                border="0"
                                style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;"
                              >
                                <tr>
                                  <td style="padding:20px 24px;font-family:Arial,sans-serif;">
                                    <p style="margin:0 0 14px 0;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">
                                      Message
                                    </p>
                                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;font-size:15px;line-height:30px;color:#1e293b;white-space:pre-line;word-break:break-word;">${formattedMessage}</div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>

                          <tr>
                            <td style="padding-top:20px;">
                              <p style="margin:0;font-size:12px;line-height:20px;color:#94a3b8;font-family:Arial,sans-serif;text-align:center;">
                                This email was generated automatically from the website contact form.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
        `,
        text: `New Contact Us Submission

Full Name: ${dto.fullName}
Email: ${dto.email}
Inquiry Type: ${inquiryLabel}

Message:
${normalizedMessage}`,
      });

      await this.transporter.sendMail({
        from: `"Support Team" <${fromEmail}>`,
        to: dto.email,
        subject: 'We received your message',
        html: `
          <div style="margin:0;padding:0;background-color:#f4f7fb;">
            <table
              role="presentation"
              width="100%"
              cellpadding="0"
              cellspacing="0"
              border="0"
              style="background-color:#f4f7fb;padding:32px 16px;"
            >
              <tr>
                <td align="center">
                  <table
                    role="presentation"
                    width="100%"
                    cellpadding="0"
                    cellspacing="0"
                    border="0"
                    style="max-width:680px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;"
                  >
                    <tr>
                      <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:28px 32px;">
                        <h2 style="margin:0;font-size:26px;line-height:34px;color:#ffffff;font-family:Arial,sans-serif;">
                          Thank you for contacting us
                        </h2>
                        <p style="margin:10px 0 0 0;font-size:14px;line-height:22px;color:#e0f2fe;font-family:Arial,sans-serif;">
                          We have successfully received your message.
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:32px;font-family:Arial,sans-serif;color:#1e293b;">
                        <p style="margin:0 0 16px 0;font-size:15px;line-height:26px;">
                          Hello ${this.escapeHtml(dto.fullName)},
                        </p>

                        <p style="margin:0 0 16px 0;font-size:15px;line-height:26px;">
                          Thank you for reaching out to us. We received your inquiry regarding
                          <strong>${this.escapeHtml(inquiryLabel)}</strong>.
                        </p>

                        <div style="margin:24px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;">
                          <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;">
                            Your Submitted Message
                          </p>
                          <div style="margin:0;font-size:15px;line-height:30px;color:#334155;white-space:pre-line;word-break:break-word;">${formattedMessage}</div>
                        </div>

                        <p style="margin:0 0 16px 0;font-size:15px;line-height:26px;">
                          Our team will review your request and get back to you as soon as possible.
                        </p>

                        <p style="margin:24px 0 0 0;font-size:15px;line-height:26px;">
                          Best regards,<br />
                          <strong>Support Team</strong>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
        `,
        text: `Hello ${dto.fullName},

Thank you for contacting us.
We received your inquiry regarding ${inquiryLabel}.

Your submitted message:
${normalizedMessage}

Our team will get back to you as soon as possible.

Best regards,
Support Team`,
      });

      return {
        message: 'Your message has been sent successfully.',
      };
    } catch (error) {
      this.logger.error(
        'Failed to send contact email',
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException(
        'Failed to send message. Please try again later.',
      );
    }
  }

  private getInquiryLabel(type: ContactInquiryType): string {
    const labels: Record<ContactInquiryType, string> = {
      [ContactInquiryType.GENERAL_INQUIRY]: 'General Inquiry',
      [ContactInquiryType.ENROLLMENT]: 'Enrollment',
      [ContactInquiryType.FACILITY_BOOKING]: 'Facility Booking',
      [ContactInquiryType.TECHNICAL_SUPPORT]: 'Technical Support',
    };

    return labels[type];
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
