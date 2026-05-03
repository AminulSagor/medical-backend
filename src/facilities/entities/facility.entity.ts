import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  roomNumber: string;

  @Column({ type: 'varchar', length: 400 })
  physicalAddress: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
