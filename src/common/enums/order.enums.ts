export enum OrderType {
  PRODUCT = 'product',
  COURSE = 'course',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

export enum FulfillmentStatus {
  UNFULFILLED = 'unfulfilled',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  RECEIVED = 'received',
  CLOSED = 'closed',
}

export enum TimelineEventType {
  ORDER_PLACED = 'order_placed',
  PAYMENT_AUTHORIZED = 'payment_authorized',
  PROCESSING_STARTED = 'processing_started',
  ORDER_SHIPPED = 'order_shipped',
  ORDER_RECEIVED = 'order_received',
  ORDER_REFUNDED = 'order_refunded',
}
