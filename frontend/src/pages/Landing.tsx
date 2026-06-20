import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-moss-light text-forest text-sm px-3 py-1 rounded-full mb-6">
          <span className="w-2 h-2 bg-forest rounded-full" />
          Document-grounded ESG data
        </div>
        <h1 className="text-5xl font-semibold text-bark-brown mb-6 leading-tight">
          Verify your ESG data in<br />
          <span className="text-forest">minutes, not months.</span>
        </h1>
        <p className="text-xl text-taupe max-w-2xl mx-auto mb-10">
          Upload your utility bills, HR exports, and board minutes. Tracewell extracts ESG metrics directly from your documents — with exact quotes, page references, and confidence scores. Every number traces back to its source.
        </p>
        <Link to="/setup" className="btn-primary text-lg px-8 py-3 inline-block">
          Start for free →
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-16">
        {[
          {
            icon: '📄',
            title: 'Document-grounded',
            desc: 'Upload PDFs, spreadsheets, or images. AI extracts values with exact source quotes — no self-reporting needed.',
          },
          {
            icon: '🔍',
            title: 'Full provenance',
            desc: 'Every metric shows which document it came from, which page, and the exact sentence — so auditors always have an answer.',
          },
          {
            icon: '⚡',
            title: 'Discrepancy detection',
            desc: 'When two documents disagree by more than 5%, Tracewell catches it and shows you both values side by side.',
          },
        ].map((f) => (
          <div key={f.title} className="card">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-bark-brown mb-2">{f.title}</h3>
            <p className="text-taupe text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="card bg-forest/5 border-forest/20">
        <p className="text-center text-taupe text-sm">
          <span className="text-forest font-medium">What good looks like:</span> Upload three documents, see extracted ESG values with exact quotes proving where each number came from. The exported report would survive someone asking "how do you know that number is right?" — because the answer is always a page reference and a quote.
        </p>
      </div>
    </div>
  );
}
