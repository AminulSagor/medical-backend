import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ContactUsService } from './contact-us.service';
import { CreateContactUsDto } from './dto/create-contact-us.dto';

@Controller('contact-us')
export class ContactUsController {
  constructor(private readonly contactUsService: ContactUsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async create(@Body() dto: CreateContactUsDto) {
    return this.contactUsService.sendContactMessage(dto);
  }
}
