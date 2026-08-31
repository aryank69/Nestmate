This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Supabase setup

NestMate uses Supabase PostgreSQL with Prisma ORM. Copy `.env.example` to `.env` and add these values from the Supabase project dashboard:

- `DATABASE_URL`: Supavisor transaction pooler URL on port `6543`, used by application and seed traffic.
- `DIRECT_URL`: Supavisor session pooler URL on port `5432`, used by Prisma migrations and administrative commands.
- `DATABASE_PASSWORD`: Database password, injected into the URL placeholders at runtime.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key.

Then run:

```bash
npm run db:migrate
npm run db:seed
```

Useful database commands:

```bash
npm run db:generate # regenerate the typed Prisma client
npm run db:deploy   # apply committed migrations outside development
npm run db:studio   # inspect local data in Prisma Studio
```

The development seed creates locality communities for Bengaluru, Mumbai, Pune, and Hyderabad. It does not create users or housing posts. Supabase Auth, Realtime subscriptions, Storage buckets, and Row Level Security policies are intentionally not configured yet.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
