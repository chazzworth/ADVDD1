import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("Uncaught Error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="min-h-screen bg-black text-red-500 font-mono p-8 flex flex-col gap-4">
                    <h1 className="text-2xl font-bold">Something went wrong.</h1>
                    <div className="bg-zinc-900 p-4 rounded border border-red-900 overflow-auto">
                        <p className="font-bold">{this.state.error?.toString()}</p>
                        <pre className="text-xs text-zinc-500 mt-2 whitespace-pre-wrap">
                            {this.state.errorInfo?.componentStack}
                        </pre>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-red-900/20 hover:bg-red-900/40 text-red-200 px-4 py-2 rounded self-start"
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
