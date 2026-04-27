import { log } from "console";


export default function TestPage() {
    type TestData = "a" | "b" | "c";
    type TestReocord = Record<string, number>;
    const testRecord: TestReocord = {
        a: 1,
        c: 3,
    };
    testRecord["dd"]=2;
    log(testRecord);

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Test Page</h1>
            <p>This page is for testing and development purposes.</p>
        </div>
    );
}