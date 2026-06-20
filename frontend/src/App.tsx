import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Setup from './pages/Setup';
import Upload from './pages/Upload';
import Review from './pages/Review';
import Wizard from './pages/Wizard';
import Score from './pages/Score';
import Benchmarks from './pages/Benchmarks';
import Recommendations from './pages/Recommendations';
import Report from './pages/Report';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/review" element={<Review />} />
            <Route path="/wizard" element={<Wizard />} />
            <Route path="/score" element={<Score />} />
            <Route path="/benchmarks" element={<Benchmarks />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/report" element={<Report />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}
