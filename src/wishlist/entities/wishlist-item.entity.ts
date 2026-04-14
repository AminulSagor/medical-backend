import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('wishlist_items')
@Unique('UQ_wishlist_user_product', ['userId', 'productId'])
export class WishlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  productId: string;

  @CreateDateColumn()
  createdAt: Date;
}
