import { factories } from '@strapi/strapi';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_KEY as string, {
  apiVersion: '2024-11-20.acacia',
});

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async create(ctx) {
    const { products } = ctx.request.body;
    try {
      console.log('Received products:', products);
      const lineItems = await Promise.all(
        products.map(async (product: { documentId: number }) => {
          console.log('Fetching product with id:', product.documentId);
          const item = await strapi
            .service('api::product.product')
            .findOne(product.documentId);

          if (!item) {
            console.error(`Product with id ${product.documentId} not found`);
            throw new Error(`Product with id ${product.documentId} not found`);
          }

          console.log('Fetched product:', item);

          return {
            price_data: {
              currency: 'usd',
              product_data: {
                name: item.productName,
              },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: 1,
          };
        })
      );

      console.log('Line items:', lineItems);

      const session = await stripe.checkout.sessions.create({
        shipping_address_collection: { allowed_countries: ['US'] },
        payment_method_types: ['card'],
        mode: 'payment',
        success_url: `${process.env.CLIENT_URL}/success`,
        cancel_url: `${process.env.CLIENT_URL}/cancel`,
        line_items: lineItems,
      });

      console.log('Stripe session created:', session);

      await strapi
        .service('api::order.order')
        .create({ data: { products, stripeId: session.id } });

      return { stripeSession: session };
    } catch (error) {
      console.error('Error creating order:', error);
      ctx.response.status = 500;
      return { error: error.message };
    }
  },
}));