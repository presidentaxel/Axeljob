import { Component } from 'react';
import { ServerErrorPage } from './ErrorPages';

/**
 * Capture les erreurs de rendu / lifecycle dans l’arbre React sous-jacent.
 * Affiche une page type 500 avec possibilité de réinitialiser l’état du boundary.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AppErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ServerErrorPage onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
