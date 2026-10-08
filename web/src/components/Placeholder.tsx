export const Placeholder = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  return (
    <section className="p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
    </section>
  );
};
