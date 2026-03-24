import { IsArray, IsUUID } from "class-validator";

export class CreateReservationDto {
    @IsUUID()
    workshopId: string;

    @IsArray()
    @IsUUID("4", { each: true })
    attendeeIds: string[];
}
