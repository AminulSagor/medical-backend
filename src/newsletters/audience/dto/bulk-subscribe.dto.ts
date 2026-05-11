import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail } from 'class-validator';

export class BulkSubscribeDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(1000)
    @IsEmail({}, { each: true })
    emails: string[];
}