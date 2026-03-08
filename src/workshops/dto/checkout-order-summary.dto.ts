import { IsArray, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { AddAttendeeDto } from "./add-attendee.dto";

export class CheckoutOrderSummaryDto {
    @IsUUID()
    workshopId: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AddAttendeeDto)
    attendees: AddAttendeeDto[];
}
