import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum ContactInquiryType {
  GENERAL_INQUIRY = 'general_inquiry',
  ENROLLMENT = 'enrollment',
  FACILITY_BOOKING = 'facility_booking',
  TECHNICAL_SUPPORT = 'technical_support',
  ORDER_INQUIRY = 'order_inquiry',
}

export class CreateContactUsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsEnum(ContactInquiryType)
  inquiryType: ContactInquiryType;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(3000)
  message: string;
}
