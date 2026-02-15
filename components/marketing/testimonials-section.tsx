const testimonials = [
  {
    initials: 'JR',
    quote: "I had an MSJ deadline in 5 days and no associate to delegate to. Motion Granted delivered a complete package I was proud to file. The citations were solid — I checked.",
    title: 'Solo Practitioner',
    location: 'Business Litigation — Baton Rouge, LA',
  },
  {
    initials: 'MT',
    quote: "What sold me was the citation verification. I've been burned by AI-generated briefs before. These citations actually check out. That alone is worth the price.",
    title: 'Managing Partner, 4-Attorney Firm',
    location: 'Commercial Litigation — New Orleans, LA',
  },
  {
    initials: 'DL',
    quote: "The turnaround and quality let me take on matters I'd normally decline. It's like having a reliable associate on call — without the overhead.",
    title: 'Solo Practitioner',
    location: 'Insurance Defense — Lafayette, LA',
  },
];

export function TestimonialsSection() {
  return (
    <section className="section">
      <div className="section-inner">
        <div className="section-header-center">
          <div className="section-label">What Attorneys Say</div>
          <h2 className="section-title">Trusted by attorneys who need results</h2>
        </div>
        <div className="testimonial-grid">
          {testimonials.map((testimonial) => (
            <div key={testimonial.initials} className="testimonial-card">
              <div className="testimonial-stars">&starf;&starf;&starf;&starf;&starf;</div>
              <p className="testimonial-text">&quot;{testimonial.quote}&quot;</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">{testimonial.initials}</div>
                <div className="testimonial-info">
                  <strong>{testimonial.title}</strong>
                  <span>{testimonial.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
