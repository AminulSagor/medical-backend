export interface AdminProductViewResponse {
  summary: {
    totalUnitsSold: number;
    totalRevenue: number;
    lastSaleDate: Date | null;

    comparison: {
      unitsSoldChangePct: number; // vs previous period
      revenueChangePct: number;
    };
  };

  product: {
    id: string;
    name: string;
    sku: string;
    brand?: string;

    clinicalDescription?: string;

    images: string[];
    badges: string[];

    organization: {
      availability: 'IN_STOCK' | 'OUT_OF_STOCK';
      department: string; // from category
    };

    clinicalBenefits: {
      icon: string;
      title: string;
      description?: string;
    }[];

    technicalSpecifications: {
      name: string;
      value: string;
    }[];

    pricing: {
      publicPrice: string;
      memberPrice: string;
      bulkTiers: {
        minQty: number;
        price: string;
      }[];
    };

    inventory: {
      currentStock: number;
      status: 'OPTIMAL' | 'LOW' | 'OUT';
    };

    crossSell: {
      frequentlyBoughtTogether: ProductMini[];
      bundleUpsells: ProductMini[];
    };
  };
}

export interface PopularCoursesMetricsResponse {
  totalEnrollments: number;
  completionRate: number;
  activeInstructors: number;
  averageRating?: number;
}

type ProductMini = {
  id: string;
  name: string;
  image?: string;
  price: string;
};
