'use client';

import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

interface ColumnInfo {
    name: string;
    type: string;
    notnull: boolean;
    pk: boolean;
}

interface SchemaInfo {
    [tableName: string]: ColumnInfo[];
}

const QueryPage = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [schema, setSchema] = useState<SchemaInfo | null>(null);
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [schemaExpanded, setSchemaExpanded] = useState(false);

    useEffect(() => {
        fetchSchema();
    }, []);

    const fetchSchema = async () => {
        try {
            const response = await fetch('http://localhost:1337/schema');
            if (!response.ok) throw new Error('Failed to fetch schema');
            const data = await response.json();
            setSchema(data);
        } catch (err) {
            console.error('Error fetching schema:', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResults(null);

        try {
            const response = await fetch('http://localhost:1337/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to execute query');
            }

            setResults(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !loading && query.trim()) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const toggleTable = (tableName: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableName)) {
            newExpanded.delete(tableName);
        } else {
            newExpanded.add(tableName);
        }
        setExpandedTables(newExpanded);
    };

    const renderSchema = () => {
        if (!schema) return null;

        return (
            <div className="mb-4 bg-white/90 rounded-lg shadow">
                <div
                    className="flex items-center p-3 cursor-pointer hover:bg-gray-50 rounded-t-lg"
                    onClick={() => setSchemaExpanded(!schemaExpanded)}
                >
                    <Database className="w-4 h-4 mr-2" />
                    <span className="font-bold">Database Schema</span>
                    {schemaExpanded ? (
                        <ChevronDown className="w-4 h-4 ml-2" />
                    ) : (
                        <ChevronRight className="w-4 h-4 ml-2" />
                    )}
                </div>
                {schemaExpanded && (
                    <div className="p-3 space-y-2">
                        {Object.entries(schema).map(([tableName, columns]) => (
                            <div key={tableName} className="border rounded">
                                <div
                                    className="flex items-center p-2 cursor-pointer hover:bg-gray-50 border-b bg-gray-50"
                                    onClick={() => toggleTable(tableName)}
                                >
                                    {expandedTables.has(tableName) ? (
                                        <ChevronDown className="w-4 h-4 mr-2" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 mr-2" />
                                    )}
                                    <span className="font-bold">{tableName}</span>
                                </div>
                                {expandedTables.has(tableName) && (
                                    <div className="p-2 text-sm">
                                        <table className="min-w-full">
                                            <thead>
                                                <tr className="text-left text-gray-500">
                                                    <th className="py-1 pr-4">Column</th>
                                                    <th className="py-1 pr-4">Type</th>
                                                    <th className="py-1 pr-4">Constraints</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {columns.map((col) => (
                                                    <tr key={col.name}>
                                                        <td className="py-1 pr-4">
                                                            {col.pk && <span className="text-yellow-600 mr-1">🔑</span>}
                                                            {col.name}
                                                        </td>
                                                        <td className="py-1 pr-4 text-blue-600">{col.type}</td>
                                                        <td className="py-1 pr-4 text-gray-500">
                                                            {col.notnull && 'NOT NULL'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="relative w-full h-screen bg-[#ADD8E6]">
            <div className="fixed z-10 top-4 left-4 right-4 bottom-4 bg-white/80 rounded shadow text-black font-mono">
                <div className="flex justify-between items-center p-4 border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="px-3 py-1 text-sm bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
                        >
                            ← Back
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-800">
                            PyMyFlySpy Query
                        </h1>
                    </div>
                </div>

                <div className="p-4 h-[calc(100%-5rem)] overflow-auto">
                    {renderSchema()}

                    <form onSubmit={handleSubmit} className="mb-6">
                        <div className="relative mb-4">
                            <textarea
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full h-40 p-3 border rounded font-mono text-sm
                                    focus:outline-none focus:ring-2 focus:ring-blue-500
                                    bg-white/90"
                                placeholder="SQLite query..."
                            />
                            <div className="absolute right-2 bottom-2 text-xs text-gray-400">
                                Press Cmd/Ctrl + Enter to execute
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !query.trim()}
                            className={`w-full py-2 px-4 rounded font-medium text-white
                                ${loading || !query.trim()
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-gray-800 hover:bg-gray-700 transition-colors'
                                }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Executing...
                                </span>
                            ) : (
                                'Execute'
                            )}
                        </button>
                    </form>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border-l-4 border-red-500 text-red-700">
                            <p className="font-medium">Error</p>
                            <p>{error}</p>
                        </div>
                    )}

                    {results && results.length > 0 && (
                        <div className="overflow-x-auto bg-white/90 rounded shadow">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50/90">
                                    <tr>
                                        {Object.keys(results[0]).map((header) => (
                                            <th
                                                key={header}
                                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                            >
                                                {header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {results.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50/50">
                                            {Object.values(row).map((value: any, j) => (
                                                <td
                                                    key={j}
                                                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                                                >
                                                    {value === null ? (
                                                        <span className="text-gray-400">NULL</span>
                                                    ) : (
                                                        String(value)
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {results && results.length === 0 && (
                        <div className="p-4 bg-gray-50/80 backdrop-blur-sm border-l-4 border-gray-500 text-gray-700">
                            <p>Query executed successfully, but returned no results.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QueryPage;